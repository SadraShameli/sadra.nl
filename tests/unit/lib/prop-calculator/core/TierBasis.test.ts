import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    contractLimitAt,
    ContractLimitKind,
    contracts,
    type DailyLossLimitContext,
    dollars,
    FirmId,
    flatDayPolicy,
    fraction,
    INSTRUMENTS,
    InstrumentSymbol,
    maxContractsAt,
    PeakRatchet,
    type Plan,
    points,
    PolicySizing,
    resolveDailyLossLimit,
    RungSizing,
    selectTier,
    TierBasis,
    tierBreakpoints,
    tierContextFromProfits,
    type TierProfitContext,
    tierProfitFor,
    TopStepVariant,
    type TrackedDailyLossLimitContext,
    type TrackedTierProfitContext,
    TradeifyVariant,
    TradingPhase,
    type UntrackedTierProfitContext,
} from '~/lib/prop-calculator/core';
import { ALL_FIRMS, findFirm } from '~/lib/prop-calculator/firms';
import {
    LossStreak,
    newPhaseStats,
    runDay,
    TradeTotals,
} from '~/lib/prop-calculator/simulator';

import { freshFundedCycle } from '../dayRunOptions';

const CROSSING: TierProfitContext = {
    peakDayCloseProfit: 3100,
    peakIntradayProfit: null,
    profit: 3050,
    sessionOpenProfit: 2900,
};

const INTRADAY_CONTRACT_TIERS = {
    kind: ContractLimitKind.Tiered,
    tierBasis: TierBasis.PeakIntradayProfit,
    tiers: [
        { maxContracts: contracts(2), minBalance: dollars(0) },
        { maxContracts: contracts(4), minBalance: dollars(1500) },
    ],
} as const;

const OUT_OF_ORDER = [
    { label: 'top', minProfit: 2000 },
    { label: 'base', minProfit: 0 },
    { label: 'middle', minProfit: 1500 },
] as const;

function labelAt(profit: number): string | undefined {
    return selectTier(OUT_OF_ORDER, profit, (tier) => tier.minProfit)?.label;
}

function topStepStandard(): Plan {
    const plan = findFirm(FirmId.TopStep)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.StandardStandard,
    });
    if (!plan) throw new Error('TopStep standard 50K plan not found');
    return plan;
}

function tradeifyGrowth(): Plan {
    const plan = findFirm(FirmId.Tradeify)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Tradeify,
        variant: TradeifyVariant.Growth,
    });
    if (!plan) throw new Error('Tradeify Growth 50K plan not found');
    return plan;
}

describe('tierProfitFor', () => {
    it('reads live profit for LiveProfit', () => {
        expect(tierProfitFor(TierBasis.LiveProfit, CROSSING)).toBe(3050);
    });

    it('reads the session-open profit for SessionOpenProfit, ignoring the peak', () => {
        expect(tierProfitFor(TierBasis.SessionOpenProfit, CROSSING)).toBe(2900);
    });

    it('reads the peak session close for PeakSessionCloseProfit', () => {
        expect(tierProfitFor(TierBasis.PeakSessionCloseProfit, CROSSING)).toBe(
            3100,
        );
    });

    it('reads the highest intraday profit reached in a completed session for PeakIntradayProfit', () => {
        expect(
            tierProfitFor(TierBasis.PeakIntradayProfit, {
                ...CROSSING,
                peakIntradayProfit: 3400,
            }),
        ).toBe(3400);
    });

    it('never lets PeakIntradayProfit fall below the peak session close or the session-open profit', () => {
        expect(
            tierProfitFor(TierBasis.PeakIntradayProfit, {
                peakDayCloseProfit: 1000,
                peakIntradayProfit: 500,
                profit: 0,
                sessionOpenProfit: 2900,
            }),
        ).toBe(2900);
        expect(
            tierProfitFor(TierBasis.PeakIntradayProfit, {
                ...CROSSING,
                peakIntradayProfit: 0,
            }),
        ).toBe(3100);
    });

    it('ignores the live intraday profit for PeakIntradayProfit, so a reach applies from the next session', () => {
        expect(
            tierProfitFor(TierBasis.PeakIntradayProfit, {
                peakDayCloseProfit: 0,
                peakIntradayProfit: 0,
                profit: 3200,
                sessionOpenProfit: 0,
            }),
        ).toBe(0);
    });

    it('fails loud when PeakIntradayProfit is read from a context that never tracked the intraday peak', () => {
        expect(() =>
            tierProfitFor(TierBasis.PeakIntradayProfit, CROSSING),
        ).toThrow(/PeakIntradayProfit/);
    });

    it('sizes a contract tier on PeakIntradayProfit from the committed intraday peak in the full tier context', () => {
        expect(
            maxContractsAt(INTRADAY_CONTRACT_TIERS, {
                peakDayCloseProfit: 0,
                peakIntradayProfit: 1600,
                profit: 0,
                sessionOpenProfit: 0,
            }),
        ).toBe(4);
        expect(
            maxContractsAt(INTRADAY_CONTRACT_TIERS, {
                peakDayCloseProfit: 0,
                peakIntradayProfit: 1400,
                profit: 1600,
                sessionOpenProfit: 0,
            }),
        ).toBe(2);
    });

    it('never lets PeakSessionCloseProfit fall below the session-open profit when the recorded peak lags it', () => {
        expect(
            tierProfitFor(TierBasis.PeakSessionCloseProfit, {
                peakDayCloseProfit: 1000,
                peakIntradayProfit: null,
                profit: 0,
                sessionOpenProfit: 2900,
            }),
        ).toBe(2900);
    });
});

describe('selectTier', () => {
    it('stays on the lowest tier just below the next breakpoint', () => {
        expect(labelAt(1499)).toBe('base');
    });

    it('moves up exactly at a breakpoint regardless of declaration order', () => {
        expect(labelAt(1500)).toBe('middle');
        expect(labelAt(2000)).toBe('top');
    });

    it('falls back to the lowest tier below every breakpoint', () => {
        expect(labelAt(-500)).toBe('base');
    });

    it('holds the highest tier far above the last breakpoint', () => {
        expect(labelAt(50_000)).toBe('top');
    });

    it('returns undefined for an empty tier list', () => {
        expect(selectTier([], 1000, (tier: number) => tier)).toBeUndefined();
    });
});

describe('tierBreakpoints', () => {
    it('sorts ascending and drops duplicates', () => {
        expect(tierBreakpoints([2000, 0, 1500, 1500])).toStrictEqual([
            0, 1500, 2000,
        ]);
    });

    it('returns an empty list for no values', () => {
        expect(tierBreakpoints([])).toStrictEqual([]);
    });
});

describe('Plan tier profit context', () => {
    it('derives the session-open profit from the balance minus the day P&L so far', () => {
        const plan = topStepStandard();
        const state = plan.initialState();
        plan.beginFundedPhase(state);
        state.balance = state.startingBalance + 2500;
        state.todayPnL = 1300;
        state.peakDayCloseProfit = 1400;

        expect(plan.tierProfitContext(state)).toStrictEqual({
            peakDayCloseProfit: 1400,
            peakIntradayProfit: 0,
            profit: 2500,
            sessionOpenProfit: 1200,
        });
    });

    it('carries the intraday peak committed at the last session close, not the running intraday high of the current session', () => {
        const plan = tradeifyGrowth();
        const state = plan.initialState();
        plan.beginFundedPhase(state);
        state.peakIntradayProfit = 2800;
        state.intradayHighProfit = 3200;
        state.balance = state.startingBalance + 3200;
        state.todayPnL = 400;

        expect(plan.tierProfitContext(state).peakIntradayProfit).toBe(2800);
    });

    it('always passes a tracked intraday peak from an account state, while a context without one still fails loud on the Tradeify scaling daily loss limit', () => {
        const plan = tradeifyGrowth();
        const state = plan.initialState();
        state.balance = state.startingBalance + 3200;

        expect(plan.tierProfitContext(state).peakIntradayProfit).toBe(0);
        expect(() =>
            resolveDailyLossLimit(plan.fundedDailyLossLimit, {
                ...plan.dailyLossLimitContext(state),
                peakIntradayProfit: null,
            }),
        ).toThrow(/PeakIntradayProfit/);
    });

    it('fails loud on the Tradeify scaling daily loss limit for a context that declares it does not track the intraday peak', () => {
        const plan = tradeifyGrowth();
        const state = plan.initialState();
        plan.beginFundedPhase(state);
        state.balance = state.startingBalance + 3200;

        expect(() =>
            resolveDailyLossLimit(plan.fundedDailyLossLimit, {
                ...plan.dailyLossLimitContext(state),
                peakIntradayProfit: null,
            }),
        ).toThrow(/PeakIntradayProfit/);
    });

    it('carries the session-open profit into the daily loss limit context', () => {
        const plan = topStepStandard();
        const state = plan.initialState();
        plan.beginFundedPhase(state);
        state.balance = state.startingBalance + 900;
        state.todayPnL = -600;
        state.thresholdLocked = true;

        expect(plan.dailyLossLimitContext(state)).toStrictEqual({
            isThresholdLocked: true,
            peakDayCloseProfit: 0,
            peakIntradayProfit: 0,
            profit: 900,
            sessionOpenProfit: 1500,
        });
    });

    it('reports the funded contract breakpoints only for the basis the plan uses', () => {
        const plan = topStepStandard();

        expect(
            plan.fundedContractTierBreakpoints(
                TierBasis.SessionOpenProfit,
                false,
            ),
        ).toStrictEqual([0, 1500, 2000]);
        expect(
            plan.fundedContractTierBreakpoints(
                TierBasis.SessionOpenProfit,
                true,
            ),
        ).toStrictEqual([0, 1500, 2000]);
        expect(
            plan.fundedContractTierBreakpoints(
                TierBasis.PeakSessionCloseProfit,
                false,
            ),
        ).toStrictEqual([]);
    });

    it('reports the funded daily loss limit breakpoints only for the basis the plan uses', () => {
        const plan = tradeifyGrowth();

        expect(
            plan.fundedDailyLossLimitTierBreakpoints(
                TierBasis.PeakIntradayProfit,
            ),
        ).toStrictEqual([0, 3000]);
        expect(
            plan.fundedDailyLossLimitTierBreakpoints(
                TierBasis.PeakSessionCloseProfit,
            ),
        ).toStrictEqual([]);
        expect(
            plan.fundedDailyLossLimitTierBreakpoints(
                TierBasis.SessionOpenProfit,
            ),
        ).toStrictEqual([]);
    });

    it('splits the positive peak breakpoints by the peak basis they ratchet on', () => {
        const plan = tradeifyGrowth();

        expect(
            plan.peakIntradayBreakpoints(TradingPhase.Funded, null),
        ).toStrictEqual([3000]);
        expect(
            plan.peakSessionCloseBreakpoints(TradingPhase.Funded, null),
        ).toStrictEqual([]);
        expect(
            plan.peakIntradayBreakpoints(TradingPhase.Funded, false),
        ).toStrictEqual([3000]);
    });

    it('builds the funded peak ratchet on the intraday peak for the Tradeify scaling daily loss limit', () => {
        const ratchet = tradeifyGrowth().peakRatchetFor(
            TradingPhase.Funded,
            null,
        );

        expect(ratchet).toBeInstanceOf(PeakRatchet);
        expect(ratchet.basis).toBe(TierBasis.PeakIntradayProfit);
        expect(ratchet.radix).toBe(2);
    });

    it('builds the funded peak ratchet on the peak session close for the Tradeify Select contract tiers', () => {
        const plan = findFirm(FirmId.Tradeify)?.findPlan({
            accountSize: 50_000,
            firm: FirmId.Tradeify,
            variant: TradeifyVariant.SelectFlex,
        });
        if (!plan) throw new Error('Tradeify Select Flex 50K plan not found');
        const ratchet = plan.peakRatchetFor(TradingPhase.Funded, false);

        expect(ratchet.basis).toBe(TierBasis.PeakSessionCloseProfit);
        expect(ratchet.radix).toBe(3);
    });

    it('refuses a peak ratchet for a plan that tiers on both peak bases', () => {
        const plan = tradeifyGrowth().withOverrides({
            contractLimits: {
                evalMicros: contracts(40),
                evalMinis: contracts(4),
                fundedMicros: {
                    kind: ContractLimitKind.Tiered,
                    tierBasis: TierBasis.PeakSessionCloseProfit,
                    tiers: [
                        { maxContracts: contracts(20), minBalance: dollars(0) },
                        {
                            maxContracts: contracts(40),
                            minBalance: dollars(1500),
                        },
                    ],
                },
                fundedMinis: {
                    kind: ContractLimitKind.Flat,
                    maxContracts: contracts(4),
                },
            },
        });

        expect(() => plan.peakRatchetFor(TradingPhase.Funded, true)).toThrow(
            /both the peak session close and the peak intraday profit/,
        );
        expect(plan.peakRatchetFor(TradingPhase.Funded, false).basis).toBe(
            TierBasis.PeakIntradayProfit,
        );
    });
});

describe('firm notes describe the TierBasis their configs use', () => {
    it('never claims the contract-limit and daily-loss-limit tier bases are one identical flag', () => {
        for (const firm of ALL_FIRMS) {
            for (const note of firm.notes) {
                expect(note, firm.displayName).not.toMatch(
                    /mirroring (the identical flag|DailyLossLimitConfig's)/,
                );
            }
        }
    });

    it('describes the Tradeify scaling daily loss limit as tiering off the highest intraday profit reached, not the prior day close', () => {
        const note = findFirm(FirmId.Tradeify)?.notes.find(
            (candidate) =>
                candidate.includes('SCALING_FUNDED_DLL') &&
                candidate.includes('TierBasis.PeakIntradayProfit'),
        );

        expect(
            tradeifyGrowth().fundedDailyLossLimitTierBreakpoints(
                TierBasis.PeakIntradayProfit,
            ),
        ).not.toStrictEqual([]);
        expect(note).toBeDefined();
        expect(note).not.toContain("prior day's confirmed EOD close");
        expect(note).toContain('highest intraday profit');
    });
});

describe('the intraday peak is a required part of the tier context (N-15 follow-up)', () => {
    it('makes every tier context say whether it tracks the intraday peak', () => {
        expectTypeOf<TierProfitContext['peakIntradayProfit']>().toEqualTypeOf<
            null | number
        >();
    });

    it('types the intraday peak as a number on a tracked context and as null on a context that cannot track it (N-15(a))', () => {
        expectTypeOf<
            TrackedTierProfitContext['peakIntradayProfit']
        >().toEqualTypeOf<number>();
        expectTypeOf<
            UntrackedTierProfitContext['peakIntradayProfit']
        >().toEqualTypeOf<null>();
        expectTypeOf<TrackedTierProfitContext>().toExtend<TierProfitContext>();
        expectTypeOf<UntrackedTierProfitContext>().toExtend<TierProfitContext>();
        expectTypeOf(
            tierContextFromProfits(0),
        ).toEqualTypeOf<UntrackedTierProfitContext>();
    });

    it('types the Plan tier and daily loss limit contexts as tracked, since AccountState always tracks the intraday peak (N-15(a), WP24)', () => {
        expectTypeOf<
            ReturnType<Plan['tierProfitContext']>
        >().toEqualTypeOf<TrackedTierProfitContext>();
        expectTypeOf<
            ReturnType<Plan['dailyLossLimitContext']>
        >().toEqualTypeOf<TrackedDailyLossLimitContext>();
        expectTypeOf<
            TrackedDailyLossLimitContext['peakIntradayProfit']
        >().toEqualTypeOf<number>();
        expectTypeOf<TrackedDailyLossLimitContext>().toExtend<DailyLossLimitContext>();
        expectTypeOf<TrackedDailyLossLimitContext>().toExtend<TrackedTierProfitContext>();
    });

    it('resolves a funded contract tier on PeakIntradayProfit from the full tier context', () => {
        const plan = tradeifyGrowth().withOverrides({
            contractLimits: {
                evalMicros: contracts(40),
                evalMinis: contracts(4),
                fundedMicros: null,
                fundedMinis: INTRADAY_CONTRACT_TIERS,
            },
        });
        const state = plan.initialState();
        plan.beginFundedPhase(state);
        state.peakIntradayProfit = 1600;
        state.intradayHighProfit = 1600;

        expect(
            contractLimitAt(
                plan.contractLimits,
                TradingPhase.Funded,
                false,
                plan.tierProfitContext(state),
            ),
        ).toBe(4);
    });

    it('lets runDay size a funded trade from a contract tier on PeakIntradayProfit: 4 NQ contracts at a 10-point stop is $800, not the 2-contract $400', () => {
        const plan = tradeifyGrowth().withOverrides({
            contractLimits: {
                evalMicros: contracts(40),
                evalMinis: contracts(4),
                fundedMicros: null,
                fundedMinis: INTRADAY_CONTRACT_TIERS,
            },
        });
        const state = plan.initialState();
        plan.beginFundedPhase(state);
        state.peakIntradayProfit = 1600;
        state.intradayHighProfit = 1600;
        const totals = new TradeTotals();

        runDay({
            commission: dollars(0),
            dayPolicy: flatDayPolicy(
                1000,
                1,
                undefined,
                PolicySizing.ContractCapped,
            ),
            fundedCycle: freshFundedCycle(plan, state),
            phase: TradingPhase.Funded,
            plan,
            positionSizing: {
                instrument: INSTRUMENTS[InstrumentSymbol.NQ],
                stopPoints: points(10),
            },
            rng: () => 0,
            rrRatio: 1,
            rungSizing: RungSizing.CapToCushion,
            state,
            stats: newPhaseStats(state.balance, totals, new LossStreak(totals)),
            winrate: fraction(1),
        });

        expect(state.balance - state.startingBalance).toBe(800);
    });
});
