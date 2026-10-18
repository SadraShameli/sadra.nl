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
    type FundedFromStateEngineOptimumResult,
    FundedFromStateOptimumResultKind,
    FundedSizingAdvisor,
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

function fromStateOptimumWith(
    label: string,
    policy: FundedWinnerPolicy,
): FundedFromStateEngineOptimumResult {
    return {
        source: AdviceSource.FundedSweepFromState,
        sweep: {
            kind: FundedFromStateOptimumResultKind.Optimum,
            optimum: {
                fromStateExpectedCash: 3200,
                fromStateExpectedCashStandardError: 90,
                fromStateExpectedRealizedCash: 2900,
                fromStateExpectedRealizedCashStandardError: 80,
                label,
                policy,
                rows: [],
                survivors: 10,
            },
        },
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
    result: FundedFromStateEngineOptimumResult,
    limits: PersonalLimits = NO_PERSONAL_LIMITS,
) {
    const view = adviceViewModel(advisor().assemble([result]), limits);
    if (view.kind !== AdviceDisplayKind.Ready) {
        throw new Error('expected ready advice');
    }
    const [row] = view.optima;
    if (row === undefined) throw new Error('expected a from-state row');
    return row;
}

describe('the from-state funded sweep row shows its winner at the current cushion (PT-109b step 5, F-121)', () => {
    it("reads a '7.5% cushion' winner at a $1,700 cushion as $127.50", () => {
        const row = rowFor(
            fromStateOptimumWith('7.5% cushion', {
                kind: FundedWinnerPolicyKind.PercentOfCushion,
                percent: 7.5,
            }),
        );

        expect(row.text).toContain('= $127.50 at your cushion of $1,700');
        expect(row.label).toContain('7.5% cushion');
        expect(row.text).toContain('Expected cash from here');
    });

    it('reads a flat $250 winner as $250 whatever the cushion', () => {
        const row = rowFor(
            fromStateOptimumWith('flat $250', {
                dollars: 250,
                kind: FundedWinnerPolicyKind.Flat,
            }),
        );

        expect(row.text).toContain('= $250 at your cushion of $1,700');
    });

    it('states whole contracts at the entered stop', () => {
        const row = rowFor(
            fromStateOptimumWith('10% cushion', {
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
});
