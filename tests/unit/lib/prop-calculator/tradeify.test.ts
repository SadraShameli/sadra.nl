import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    applyTrade,
    closeTradingDay,
    contractLimitAt,
    ContractLimitKind,
    DailyLossLimitKind,
    DayStopRuleKind,
    dollars,
    FirmId,
    fraction,
    INSTRUMENTS,
    InstrumentSymbol,
    newFundedCycleTracker,
    type Plan,
    points,
    PolicySizing,
    resetForNewDay,
    resolveDailyLossLimit,
    RungSizing,
    TierBasis,
    TradeifyVariant,
} from '~/lib/prop-calculator/core';
import { TradingPhase } from '~/lib/prop-calculator/core/TradingPhase';
import { Tradeify } from '~/lib/prop-calculator/firms/tradeify/Tradeify';
import {
    LossStreak,
    newPhaseStats,
    runDay,
    TradeTotals,
} from '~/lib/prop-calculator/simulator';

import { freshFundedCycle } from './dayRunOptions';
import { scriptedRng } from './scriptedRng';

const firm = new Tradeify();

function lightningPlan() {
    const plan = firm.findPlan({
        accountSize: 50_000,
        firm: FirmId.Tradeify,
        variant: TradeifyVariant.Lightning,
    });
    if (!plan) throw new Error('Tradeify Lightning 50K plan not found');
    return plan;
}

describe('Tradeify Lightning: eval-phase DLL matches the live product (no separate eval phase, single continuous DLL from day one)', () => {
    it('locks out the day once losses exceed the $1,250 scaling DLL, in both eval and funded phase', () => {
        const plan = lightningPlan();

        const evalState = plan.initialState();
        evalState.balance -= 1500;
        evalState.todayPnL = -1500;
        expect(plan.isDayLockedOut(evalState, TradingPhase.Eval)).toBe(true);

        const fundedState = plan.initialState();
        fundedState.balance -= 1500;
        fundedState.todayPnL = -1500;
        expect(plan.isDayLockedOut(fundedState, TradingPhase.Funded)).toBe(
            true,
        );
    });

    it('does not lock out a loss under the $1,250 threshold', () => {
        const plan = lightningPlan();
        const state = plan.initialState();
        state.balance -= 1000;
        state.todayPnL = -1000;
        expect(plan.isDayLockedOut(state, TradingPhase.Eval)).toBe(false);
    });

    it('never busts the account on a DLL hit alone (DLL locks the day, not the account)', () => {
        const plan = lightningPlan();
        const state = plan.initialState();
        state.balance -= 1500;
        state.todayPnL = -1500;
        expect(plan.isBust(state, TradingPhase.Eval)).toBe(false);
    });
});

describe('Tradeify Lightning: payout cadence is goal-based, not day-based (Tradeify\'s own detail panel: "Not Fixed (Payout Profit Goals are the profits required between payout requests.)", "No minimum trading days required")', () => {
    it('requires 0 qualifying days between payouts, correcting an earlier reading of a live "5 Days" figure that turned out to belong elsewhere', () => {
        expect(lightningPlan().minDaysAfterPassForPayout).toBe(0);
    });
});

describe("Tradeify: every plan's fees.reset is wired from its own resetFee field, not reused from evalCost", () => {
    it('Growth, Select Daily, and Select Flex each charge their own distinct reset fee, not their eval fee', () => {
        const growth = firm.findPlan({
            accountSize: 50_000,
            firm: FirmId.Tradeify,
            variant: TradeifyVariant.Growth,
        });
        const selectDaily = firm.findPlan({
            accountSize: 50_000,
            firm: FirmId.Tradeify,
            variant: TradeifyVariant.SelectDaily,
        });
        const selectFlex = firm.findPlan({
            accountSize: 50_000,
            firm: FirmId.Tradeify,
            variant: TradeifyVariant.SelectFlex,
        });
        if (!growth || !selectDaily || !selectFlex) {
            throw new Error('Tradeify 50K plan(s) not found');
        }

        expect(growth.fees.reset).toBe(95);
        expect(growth.fees.reset).not.toBe(growth.fees.oneTimeEval);

        expect(selectDaily.fees.reset).toBe(109);
        expect(selectDaily.fees.reset).not.toBe(selectDaily.fees.oneTimeEval);

        expect(selectFlex.fees.reset).toBe(109);
        expect(selectFlex.fees.reset).not.toBe(selectFlex.fees.oneTimeEval);
    });

    it("Lightning's fees.reset reads resetFee (492), matching the pattern used by every other Tradeify plan builder, rather than silently falling back to evalCost as a dead-field trap", () => {
        const plan = lightningPlan();
        expect(plan.fees.reset).toBe(492);
    });
});

const SELECT_VARIANTS = [
    TradeifyVariant.SelectFlex,
    TradeifyVariant.SelectDaily,
] as const;

function fundedStateAfterWinThenLoss(plan: Plan): AccountState {
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    runSelectFundedDay(plan, state, {
        ladder: [500, 500, 500, 500],
        outcomes: [0, 0, 0, 0],
        symbol: null,
    });
    runSelectFundedDay(plan, state, {
        ladder: [800],
        outcomes: [0.99],
        symbol: null,
    });
    resetForNewDay(state);
    return state;
}

function growthPlan(): Plan {
    return selectPlan(TradeifyVariant.Growth);
}

function runSelectFundedDay(
    plan: Plan,
    state: AccountState,
    options: {
        ladder: readonly number[];
        outcomes: readonly number[];
        symbol: InstrumentSymbol | null;
    },
) {
    const totals = new TradeTotals();
    return runDay({
        commission: dollars(0),
        dayPolicy: {
            ladder: options.ladder,
            maxLossesPerDay: null,
            sizing: PolicySizing.ContractCapped,
            stopRule: { kind: DayStopRuleKind.None },
        },
        fundedCycle: freshFundedCycle(plan, state),
        phase: TradingPhase.Funded,
        plan,
        positionSizing:
            options.symbol === null
                ? null
                : {
                      instrument: INSTRUMENTS[options.symbol],
                      stopPoints: points(1.25),
                  },
        rng: scriptedRng(options.outcomes),
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

function selectFundedContracts(
    plan: Plan,
    state: AccountState,
    isMicro: boolean,
): null | number {
    return contractLimitAt(
        plan.contractLimits,
        TradingPhase.Funded,
        isMicro,
        plan.tierProfitContext(state),
    );
}

function selectPlan(variant: TradeifyVariant): Plan {
    const plan = firm.findPlan({
        accountSize: 50_000,
        firm: FirmId.Tradeify,
        variant,
    });
    if (!plan) throw new Error(`Tradeify 50K ${variant} plan not found`);
    return plan;
}

describe.each(SELECT_VARIANTS)(
    'Tradeify %s funded contract tiers are cumulative (help article 12853966, "once you reach a higher tier, you retain those limits even if your balance fluctuates")',
    (variant) => {
        const plan = selectPlan(variant);

        it('resolves both funded contract tiers from the peak session close', () => {
            for (const config of [
                plan.contractLimits?.fundedMinis,
                plan.contractLimits?.fundedMicros,
            ]) {
                expect(config?.kind).toBe(ContractLimitKind.Tiered);
                if (config?.kind === ContractLimitKind.Tiered) {
                    expect(config.tierBasis).toBe(
                        TierBasis.PeakSessionCloseProfit,
                    );
                }
            }
        });

        it('keeps 4 minis and 40 micros after a $2,000 close followed by a losing day that closes at $1,200', () => {
            const state = fundedStateAfterWinThenLoss(plan);
            expect(state.balance).toBe(state.startingBalance + 1200);
            expect(state.peakDayCloseProfit).toBe(2000);
            expect(selectFundedContracts(plan, state, false)).toBe(4);
            expect(selectFundedContracts(plan, state, true)).toBe(40);
        });

        it.each([InstrumentSymbol.NQ, InstrumentSymbol.MNQ])(
            'sizes the next simulated %s trade at the retained top tier, not the 2/20 bottom tier',
            (symbol) => {
                const state = fundedStateAfterWinThenLoss(plan);
                const result = runSelectFundedDay(plan, state, {
                    ladder: [1000],
                    outcomes: [0],
                    symbol,
                });
                expect(result.busted).toBe(false);
                expect(state.todayPnL).toBe(100);
            },
        );

        it('keeps 3 minis and 30 micros after a $1,500 close followed by a losing day that closes at $500', () => {
            const state = plan.initialState();
            plan.beginFundedPhase(state);
            runSelectFundedDay(plan, state, {
                ladder: [500, 500, 500],
                outcomes: [0, 0, 0],
                symbol: null,
            });
            runSelectFundedDay(plan, state, {
                ladder: [500, 500],
                outcomes: [0.99, 0.99],
                symbol: null,
            });
            resetForNewDay(state);
            expect(state.balance).toBe(state.startingBalance + 500);
            expect(selectFundedContracts(plan, state, false)).toBe(3);
            expect(selectFundedContracts(plan, state, true)).toBe(30);
        });

        it('waits for the session close before raising the tier ("Next day limits increase")', () => {
            const state = plan.initialState();
            plan.beginFundedPhase(state);
            state.peakDayCloseProfit = 1400;
            state.balance = state.startingBalance + 2500;
            state.todayPnL = 1100;
            expect(selectFundedContracts(plan, state, false)).toBe(2);
            expect(selectFundedContracts(plan, state, true)).toBe(20);
        });

        it('starts a new funded account back on the 2/20 bottom tier', () => {
            const state = fundedStateAfterWinThenLoss(plan);
            plan.beginFundedPhase(state);
            expect(selectFundedContracts(plan, state, false)).toBe(2);
            expect(selectFundedContracts(plan, state, true)).toBe(20);
        });
    },
);

function selectFlexStateAfterPayout(plan: Plan) {
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    const tracker = newFundedCycleTracker(state);
    for (let day = 0; day < 5; day++) {
        runSelectFundedDay(plan, state, {
            ladder: [400],
            outcomes: [0],
            symbol: null,
        });
    }
    tracker.recordSessionClose(state);
    const payout = tracker.tryPayout({
        minRetainedCushion: 0,
        payoutRequestSize: undefined,
        plan,
        state,
    });
    resetForNewDay(state);
    return { payout, state };
}

describe('Tradeify Select Flex keeps the cumulative contract tier after a payout (help article 12853966)', () => {
    const plan = selectPlan(TradeifyVariant.SelectFlex);

    it('keeps 4 minis and 40 micros after a $2,000 close and a $1,000 payout that leaves $1,000 profit', () => {
        const { payout, state } = selectFlexStateAfterPayout(plan);
        expect(payout?.debited).toBe(1000);
        expect(state.balance).toBe(state.startingBalance + 1000);
        expect(state.peakDayCloseProfit).toBe(2000);
        expect(selectFundedContracts(plan, state, false)).toBe(4);
        expect(selectFundedContracts(plan, state, true)).toBe(40);
    });

    it.each([InstrumentSymbol.NQ, InstrumentSymbol.MNQ])(
        'sizes the next simulated %s trade after the payout at the retained top tier',
        (symbol) => {
            const { state } = selectFlexStateAfterPayout(plan);
            const result = runSelectFundedDay(plan, state, {
                ladder: [1000],
                outcomes: [0],
                symbol,
            });
            expect(result.busted).toBe(false);
            expect(state.todayPnL).toBe(100);
        },
    );
});

function fundedDll(plan: Plan, state: AccountState): null | number {
    return resolveDailyLossLimit(
        plan.fundedDailyLossLimit,
        plan.dailyLossLimitContext(state),
    );
}

describe('Tradeify scaling funded DLL (help article 10468321 "Rules: Daily Loss Limit")', () => {
    it('raises the DLL to $2,000 the session after a $3,000 close and never reverts it after a losing close', () => {
        const plan = growthPlan();
        expect(plan.fundedDailyLossLimit.kind).toBe(DailyLossLimitKind.Tiered);
        const state = plan.initialState();
        plan.beginFundedPhase(state);
        state.balance = state.startingBalance + 3000;
        state.todayPnL = 3000;
        expect(fundedDll(plan, state)).toBe(1250);
        plan.recordDayClosePeak(state);
        state.todayPnL = 0;
        expect(fundedDll(plan, state)).toBe(2000);
        state.balance = state.startingBalance + 2500;
        plan.recordDayClosePeak(state);
        expect(fundedDll(plan, state)).toBe(2000);
    });

    it.each([
        { variant: TradeifyVariant.Growth, withEval: false },
        { variant: TradeifyVariant.Lightning, withEval: true },
    ])(
        'tiers the $variant scaling DLL on the highest intraday profit reached',
        ({ variant, withEval }) => {
            const plan = selectPlan(variant);
            const configs = withEval
                ? [plan.fundedDailyLossLimit, plan.evalDailyLossLimit]
                : [plan.fundedDailyLossLimit];
            for (const config of configs) {
                expect(config.kind).toBe(DailyLossLimitKind.Tiered);
                if (config.kind === DailyLossLimitKind.Tiered) {
                    expect(config.tierBasis).toBe(TierBasis.PeakIntradayProfit);
                }
            }
        },
    );

    it('raises the DLL the session after an intraday reach of $53,000 that closes below it', () => {
        const plan = growthPlan();
        const state = plan.initialState();
        plan.beginFundedPhase(state);
        const result = runSelectFundedDay(plan, state, {
            ladder: [1250, 1250, 500, 1000],
            outcomes: [0, 0, 0, 0.99],
            symbol: null,
        });
        expect(result.busted).toBe(false);
        expect(state.intradayHighProfit).toBe(3000);
        expect(state.balance).toBe(state.startingBalance + 2000);
        expect(state.peakDayCloseProfit).toBe(2000);

        resetForNewDay(state);
        expect(fundedDll(plan, state)).toBe(2000);
    });

    it('keeps the $1,250 DLL for the rest of the session in which the balance first reaches $53,000', () => {
        const plan = growthPlan();
        const state = plan.initialState();
        plan.beginFundedPhase(state);
        applyTrade(plan, TradingPhase.Funded, state, 3000);
        expect(fundedDll(plan, state)).toBe(1250);
        applyTrade(plan, TradingPhase.Funded, state, -1000);
        expect(fundedDll(plan, state)).toBe(1250);

        closeTradingDay(plan, TradingPhase.Funded, state, true);
        resetForNewDay(state);
        expect(fundedDll(plan, state)).toBe(2000);
    });

    it('never reverts the raised DLL after a losing session or on a new session below the threshold', () => {
        const plan = growthPlan();
        const state = plan.initialState();
        plan.beginFundedPhase(state);
        applyTrade(plan, TradingPhase.Funded, state, 3000);
        applyTrade(plan, TradingPhase.Funded, state, -1000);
        closeTradingDay(plan, TradingPhase.Funded, state, true);
        resetForNewDay(state);
        applyTrade(plan, TradingPhase.Funded, state, -1500);
        closeTradingDay(plan, TradingPhase.Funded, state, true);
        resetForNewDay(state);

        expect(state.balance).toBe(state.startingBalance + 500);
        expect(fundedDll(plan, state)).toBe(2000);
    });

    it('starts a new funded account back on the $1,250 DLL', () => {
        const plan = growthPlan();
        const state = plan.initialState();
        plan.beginFundedPhase(state);
        applyTrade(plan, TradingPhase.Funded, state, 3000);
        closeTradingDay(plan, TradingPhase.Funded, state, true);
        plan.beginFundedPhase(state);

        expect(fundedDll(plan, state)).toBe(1250);
    });
});

describe('Tradeify tier notes', () => {
    it('states that the Select contract tiers are cumulative on TierBasis.PeakSessionCloseProfit and cites the payout policy article', () => {
        const note = firm.notes.find((candidate) =>
            candidate.includes('SELECT_CONTRACT_LIMITS'),
        );
        expect(note).toContain('TierBasis.PeakSessionCloseProfit');
        expect(note).toContain('12853966');
        expect(note).toContain(
            'once you reach a higher tier, you retain those limits even if your balance fluctuates',
        );
        expect(
            firm.notes.some((candidate) =>
                candidate.includes(
                    'set to TierBasis.SessionOpenProfit on both fundedMicros and fundedMinis',
                ),
            ),
        ).toBe(false);
    });

    it('records the intraday-reach DLL trigger as modeled on TierBasis.PeakIntradayProfit, with no known approximation left', () => {
        const note = firm.notes.find((candidate) =>
            candidate.includes('SCALING_FUNDED_DLL'),
        );
        expect(note).toContain('10468321');
        expect(note).toContain(
            "If you reach $53,000 on a 50K account during Monday's session",
        );
        expect(note).toContain('TierBasis.PeakIntradayProfit');
        expect(note).not.toContain('Known approximation');
        expect(note).not.toContain('neither the simulator');
        expect(note).not.toContain('Open question');
        expect(note).not.toContain('once EOD balance reaches');
        expect(note).not.toContain(
            'sets no basis and so takes the TierBasis.LiveProfit default',
        );
    });
});

describe('Tradeify Lightning payout basis note discloses both readings (N-85, U27)', () => {
    it('cites the payout-policy article and the homepage 5-day field, and keeps 0', () => {
        const note = firm.notes.find((candidate) =>
            candidate.includes('minDaysAfterPassForPayout'),
        );
        expect(note).toContain('10495932');
        expect(note).toContain('No Minimum Trading Day Count');
        expect(note).toContain('Payout Frequency');
        expect(note).toContain('5 Days');
    });
});

describe('Tradeify Select consistency add-on note cites the pricing reference, not the checkout screenshot as a correction (N-85)', () => {
    it('states $205 eval / $135 reset at 50K and keeps +$200 as a recorded conflicting observation', () => {
        const note = firm.notes.find((candidate) =>
            candidate.includes('40% consistency rule can be paid-upgraded'),
        );
        expect(note).toContain('14369021');
        expect(note).toContain('205');
        expect(note).toContain('135');
        expect(note).toContain('conflicting observation');
    });
});
