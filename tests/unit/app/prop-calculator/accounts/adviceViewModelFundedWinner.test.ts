import { describe, expect, it } from 'vitest';

import {
    AdviceDisplayKind,
    adviceViewModel,
    type PersonalLimits,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/adviceViewModel';
import {
    type AccountState,
    findFirm,
    FirmId,
    InstrumentSymbol,
    newFundedCycleTracker,
    type Plan,
    serializePlanId,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AdviceSource,
    DEFAULT_RULEBOOK,
    type EngineOptimum,
    FundedSizingAdvisor,
    type FundedSweepEngineOptimumResult,
    FundedSweepOptimumResultKind,
    type FundedWinnerPolicy,
    FundedWinnerPolicyKind,
    NO_PENDING_PAYOUT_COUNTS,
} from '~/lib/prop-calculator/advisor';

import { NO_PERSONAL_LIMITS } from './personalLimitsFixture';

const CUSHION = 1700;

function advisor(): FundedSizingAdvisor {
    const state: AccountState = {
        balance: 50_000 + CUSHION,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
        intradayHighProfit: 0,
        peakDayCloseProfit: 0,
        peakIntradayProfit: 0,
        qualifyingDays: 20,
        startingBalance: 50_000,
        threshold: 50_000,
        thresholdLocked: false,
        todayPnL: 0,
        tradingDays: 20,
    };
    return new FundedSizingAdvisor({
        account: {
            assumptions: [],
            contractLimit: null,
            cushion: CUSHION,
            fundedTracker: newFundedCycleTracker({
                ...state,
                balance: state.startingBalance,
            }),
            kind: TradingPhase.Funded,
            plan: plan(),
            resolvedDailyLossLimit: null,
            state,
            ...NO_PENDING_PAYOUT_COUNTS,
        },
        fundedHorizonDays: 90,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
        trials: 20,
    });
}

function optimumWith(
    label: string,
    policy: FundedWinnerPolicy,
): FundedSweepEngineOptimumResult {
    const optimum: EngineOptimum = {
        expectedHorizonCredit: 0,
        expectedHorizonCreditStandardError: null,
        expectedMonthlyNet: 2000,
        expectedMonthlyNetStandardError: 50,
        expectedMonthlyRealizedNet: 1800,
        expectedMonthlyRealizedNetStandardError: 40,
        label,
        policy,
        rows: [],
        survivors: 10,
    };
    return {
        source: AdviceSource.FundedSweepFresh,
        sweep: { kind: FundedSweepOptimumResultKind.Optimum, optimum },
    };
}

function plan(): Plan {
    const id = {
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.StandardStandard,
    } as const;
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

function rowFor(
    result: FundedSweepEngineOptimumResult,
    limits: PersonalLimits = NO_PERSONAL_LIMITS,
) {
    const view = adviceViewModel(advisor().assemble([result]), limits);
    if (view.kind !== AdviceDisplayKind.Ready) {
        throw new Error('expected ready advice');
    }
    const [row] = view.optima;
    if (row === undefined) throw new Error('expected a funded sweep row');
    return row;
}

describe('the funded sweep row shows its winner at the current cushion (PT-108 step 3, F-121)', () => {
    it("reads a '10% cushion' winner at a $1,700 cushion as $170", () => {
        const row = rowFor(
            optimumWith('10% cushion', {
                kind: FundedWinnerPolicyKind.PercentOfCushion,
                percent: 10,
            }),
        );

        expect(row.text).toContain('= $170 at your cushion of $1,700');
        expect(row.label).toContain('10% cushion');
    });

    it('reads a flat $250 winner as $250 whatever the cushion', () => {
        const row = rowFor(
            optimumWith('flat $250', {
                dollars: 250,
                kind: FundedWinnerPolicyKind.Flat,
            }),
        );

        expect(row.text).toContain('= $250 at your cushion of $1,700');
    });

    it('reads a ladder winner as its first rung', () => {
        const row = rowFor(
            optimumWith('ladder 400/600', {
                kind: FundedWinnerPolicyKind.Ladder,
                rungs: [400, 600],
            }),
        );

        expect(row.text).toContain('= $400 at your cushion of $1,700');
    });

    it('keeps cents when the winner is not a whole dollar', () => {
        const row = rowFor(
            optimumWith('7.5% cushion', {
                kind: FundedWinnerPolicyKind.PercentOfCushion,
                percent: 7.5,
            }),
        );

        expect(row.text).toContain('= $127.50 at your cushion of $1,700');
    });

    it('states whole contracts at the entered stop', () => {
        const row = rowFor(
            optimumWith('10% cushion', {
                kind: FundedWinnerPolicyKind.PercentOfCushion,
                percent: 10,
            }),
            {
                ...NO_PERSONAL_LIMITS,
                viewContext: {
                    placement: {
                        instrument: InstrumentSymbol.NQ,
                        stopPoints: 5,
                    },
                    plan: plan(),
                },
            },
        );

        expect(row.text).toContain(
            '= $170 at your cushion of $1,700, which is 1 NQ contract ($100) at your 5-point stop',
        );
    });

    it('says the winner is below one contract at the entered stop', () => {
        const row = rowFor(
            optimumWith('flat $250', {
                dollars: 250,
                kind: FundedWinnerPolicyKind.Flat,
            }),
            {
                ...NO_PERSONAL_LIMITS,
                viewContext: {
                    placement: {
                        instrument: InstrumentSymbol.NQ,
                        stopPoints: 20,
                    },
                    plan: plan(),
                },
            },
        );

        expect(row.text).toContain(
            'below one NQ contract at your 20-point stop',
        );
    });
});
