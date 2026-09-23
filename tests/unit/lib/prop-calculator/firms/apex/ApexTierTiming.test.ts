import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    ApexVariant,
    ContractLimitKind,
    DailyLossLimitKind,
    type DayPolicy,
    DayStopRuleKind,
    dollars,
    FirmId,
    flatDayPolicy,
    fraction,
    type Plan,
    resolveContractLimit,
    resolveDailyLossLimit,
    RungSizing,
    TierBasis,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { ApexTraderFunding } from '~/lib/prop-calculator/firms/apex/ApexTraderFunding';
import {
    LossStreak,
    newPhaseStats,
    runDay,
    TradeTotals,
} from '~/lib/prop-calculator/simulator';

const firm = new ApexTraderFunding();
const VARIANTS = [ApexVariant.Eod, ApexVariant.Intraday] as const;

function findPlan(variant: ApexVariant): Plan {
    const plan = firm.findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant,
    });
    if (!plan) throw new Error(`Apex 50K ${variant} plan not found`);
    return plan;
}

function fundedContracts(
    plan: Plan,
    state: AccountState,
    isMicro: boolean,
): null | number {
    const context = plan.tierProfitContext(state);
    return resolveContractLimit(
        plan.contractLimits,
        TradingPhase.Funded,
        isMicro,
        context.profit,
        context.sessionOpenProfit,
        context.peakDayCloseProfit,
    );
}

function fundedDll(plan: Plan, state: AccountState): null | number {
    return resolveDailyLossLimit(
        plan.fundedDailyLossLimit,
        plan.dailyLossLimitContext(state),
    );
}

function fundedState(
    plan: Plan,
    options: { peak: number; sessionOpenProfit: number; todayPnL: number },
): AccountState {
    const state = plan.initialState();
    state.balance =
        state.startingBalance + options.sessionOpenProfit + options.todayPnL;
    state.todayPnL = options.todayPnL;
    state.peakDayCloseProfit = options.peak;
    state.threshold = state.startingBalance + 100;
    state.thresholdLocked = true;
    return state;
}

function runFundedDay(
    plan: Plan,
    state: AccountState,
    dayPolicy: DayPolicy,
    rng: () => number,
) {
    const totals = new TradeTotals();
    return runDay({
        commission: dollars(0),
        dayPolicy,
        phase: TradingPhase.Funded,
        plan,
        positionSizing: null,
        rng,
        rrRatio: 1,
        rungSizing: RungSizing.CapToCushion,
        state,
        stats: newPhaseStats(
            state.startingBalance,
            totals,
            new LossStreak(totals),
        ),
        winrate: fraction(0.5),
    });
}

function scriptedRng(values: readonly number[]): () => number {
    let index = 0;
    return () => {
        const value = values[index];
        index += 1;
        if (value === undefined) throw new Error('scripted rng exhausted');
        return value;
    };
}

describe.each(VARIANTS)(
    'Apex 50K %s PA Levels come from the prior session close',
    (variant) => {
        const plan = findPlan(variant);

        it('resolves the funded DLL and both contract tiers from the session-open profit', () => {
            expect(plan.fundedDailyLossLimit.kind).toBe(
                DailyLossLimitKind.Tiered,
            );
            if (plan.fundedDailyLossLimit.kind === DailyLossLimitKind.Tiered) {
                expect(plan.fundedDailyLossLimit.tierBasis).toBe(
                    TierBasis.SessionOpenProfit,
                );
            }
            for (const config of [
                plan.contractLimits?.fundedMinis,
                plan.contractLimits?.fundedMicros,
            ]) {
                expect(config?.kind).toBe(ContractLimitKind.Tiered);
                if (config?.kind === ContractLimitKind.Tiered) {
                    expect(config.tierBasis).toBe(TierBasis.SessionOpenProfit);
                }
            }
        });

        it('keeps the $1,000 DLL for the rest of a session that opened at $2,900 and rallied to $3,200', () => {
            const state = fundedState(plan, {
                peak: 2900,
                sessionOpenProfit: 2900,
                todayPnL: 300,
            });
            expect(fundedDll(plan, state)).toBe(1000);
        });

        it('keeps the $2,000 DLL for the rest of a session that opened at $3,100 and fell to $2,800', () => {
            const state = fundedState(plan, {
                peak: 3100,
                sessionOpenProfit: 3100,
                todayPnL: -300,
            });
            expect(fundedDll(plan, state)).toBe(2000);
        });

        it('moves the DLL down for the next session after a close back under $3,000', () => {
            const state = fundedState(plan, {
                peak: 3100,
                sessionOpenProfit: 2900,
                todayPnL: 0,
            });
            expect(fundedDll(plan, state)).toBe(1000);
        });

        it('re-derives the Level from the post-payout close, not the pre-payout peak', () => {
            const state = fundedState(plan, {
                peak: 6200,
                sessionOpenProfit: 2600,
                todayPnL: 0,
            });
            expect(fundedDll(plan, state)).toBe(1000);
            expect(fundedContracts(plan, state, false)).toBe(3);
            expect(fundedContracts(plan, state, true)).toBe(30);
        });

        it.each([
            { live: 1600, minis: 2, open: 1400 },
            { live: 1400, minis: 3, open: 1600 },
            { live: 2900, minis: 4, open: 3100 },
            { live: 3200, minis: 3, open: 2900 },
            { live: 0, minis: 2, open: 1400 },
        ])(
            'caps contracts at $minis minis for a session opened at $open profit, even at $live live profit',
            ({ live, minis, open }) => {
                const state = fundedState(plan, {
                    peak: Math.max(open, 3100),
                    sessionOpenProfit: open,
                    todayPnL: live - open,
                });
                expect(fundedContracts(plan, state, false)).toBe(minis);
                expect(fundedContracts(plan, state, true)).toBe(minis * 10);
            },
        );

        it('does not lock out a -$1,000 day that opened on the $2,000 Level', () => {
            const state = fundedState(plan, {
                peak: 3100,
                sessionOpenProfit: 3100,
                todayPnL: -1000,
            });
            expect(plan.isDayLockedOut(state, TradingPhase.Funded)).toBe(false);
        });

        it('lets a session opened on the $2,000 Level lose the full $2,000 across four $600 losses', () => {
            const state = fundedState(plan, {
                peak: 3100,
                sessionOpenProfit: 3100,
                todayPnL: 0,
            });
            const result = runFundedDay(
                plan,
                state,
                flatDayPolicy(600, 4, { kind: DayStopRuleKind.None }),
                scriptedRng([0.99, 0.99, 0.99, 0.99]),
            );
            expect(result.busted).toBe(false);
            expect(state.todayPnL).toBe(-2000);
            expect(state.balance).toBe(state.startingBalance + 1100);
        });

        it('sizes a loss after an intraday gain off the $1,000 Level the session opened on', () => {
            const state = fundedState(plan, {
                peak: 2900,
                sessionOpenProfit: 2900,
                todayPnL: 0,
            });
            const result = runFundedDay(
                plan,
                state,
                {
                    ladder: [150, 2000],
                    maxLossesPerDay: null,
                    stopRule: { kind: DayStopRuleKind.None },
                },
                scriptedRng([0, 0.99]),
            );
            expect(result.busted).toBe(false);
            expect(state.todayPnL).toBe(-1000);
            expect(state.balance).toBe(state.startingBalance + 1900);
        });
    },
);

describe('Apex PA Level note', () => {
    const levelNote = firm.notes.find((note) =>
        note.includes('TierBasis.SessionOpenProfit'),
    );

    it('states the prior-session-close rule for both PA variants', () => {
        expect(levelNote).toBeDefined();
        expect(levelNote).toContain('prior full session');
        expect(levelNote).toContain('EOD & Intraday Trailing');
    });

    it('discloses that the funded DP does not apply the funded Daily Loss Limit at all yet', () => {
        expect(levelNote).toContain(
            'does not apply the funded Daily Loss Limit at all yet',
        );
        expect(levelNote).toContain('capped only by cushion');
        expect(levelNote).not.toContain(
            'session-open profit equals live profit',
        );
    });
});
