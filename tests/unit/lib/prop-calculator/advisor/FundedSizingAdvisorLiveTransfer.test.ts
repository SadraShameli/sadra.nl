import { beforeAll, describe, expect, it } from 'vitest';

import {
    type AccountState,
    findFirm,
    FirmId,
    fraction,
    type FundedCycleTracker,
    newFundedCycleTracker,
    type Plan,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    type Advice,
    AdviceSource,
    AssumptionKind,
    DEFAULT_RULEBOOK,
    type EngineOptimumRunnerResult,
    type FundedFromStateEngineOptimumResult,
    FundedFromStateOptimumResultKind,
    FundedSizingAdvisor,
    type FundedSweepEngineOptimumResult,
    type LiveTransferHazardAssumption,
    NO_PENDING_PAYOUT_COUNTS,
    type ReconstructedFundedOrEvalAccount,
    type RulebookParameters,
    runEngineOptimum,
} from '~/lib/prop-calculator/advisor';

const HAZARD = 0.3;

const PLAN = registryPlan();

const HAZARD_RULEBOOK: RulebookParameters = {
    ...DEFAULT_RULEBOOK,
    liveTransfer: { hazardPerPaidPayoutByFirm: { [FirmId.TopStep]: HAZARD } },
};

function accountOf(tradingDays: number): ReconstructedFundedOrEvalAccount {
    const state = stateOf(tradingDays);
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: trackerOf(state),
        kind: TradingPhase.Funded,
        plan: PLAN,
        resolvedDailyLossLimit: null,
        state,
        ...NO_PENDING_PAYOUT_COUNTS,
    };
}

function advisorOf(
    tradingDays: number,
    rulebook: RulebookParameters = DEFAULT_RULEBOOK,
): FundedSizingAdvisor {
    return new FundedSizingAdvisor({
        account: accountOf(tradingDays),
        fundedHorizonDays: 60,
        rulebook,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
        trials: 20,
    });
}

function freshOf(
    results: readonly EngineOptimumRunnerResult[],
): FundedSweepEngineOptimumResult {
    const found = results.find(
        (result): result is FundedSweepEngineOptimumResult =>
            result.source === AdviceSource.FundedSweepFresh,
    );
    if (found === undefined) throw new Error('expected a fresh sweep result');
    return found;
}

function fromStateOf(
    results: readonly EngineOptimumRunnerResult[],
): FundedFromStateEngineOptimumResult {
    const found = results.find(
        (result): result is FundedFromStateEngineOptimumResult =>
            result.source === AdviceSource.FundedSweepFromState,
    );
    if (found === undefined) throw new Error('expected a from-state result');
    return found;
}

function hazardAssumptionsOf(
    advice: Advice,
): readonly LiveTransferHazardAssumption[] {
    return advice.assumptions.flatMap((assumption) =>
        assumption.kind === AssumptionKind.LiveTransferHazard
            ? [assumption]
            : [],
    );
}

function notPricedCountOf(advice: Advice): number {
    return advice.assumptions.filter(
        (assumption) =>
            assumption.kind === AssumptionKind.LiveTransferHazardNotPriced,
    ).length;
}

function pricedSweepsOf(
    advisor: FundedSizingAdvisor,
): readonly EngineOptimumRunnerResult[] {
    return advisor
        .optimumRequests()
        .filter(
            (request) =>
                request.source === AdviceSource.FundedSweepFresh ||
                request.source === AdviceSource.FundedSweepFromState,
        )
        .map((request) => runEngineOptimum(PLAN, request));
}

function registryPlan(): Plan {
    const found = findFirm(FirmId.TopStep)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.StandardStandard,
    });
    if (!found) throw new Error('TopStep 50K plan missing');
    return found;
}

function stateOf(tradingDays: number): AccountState {
    return {
        balance: 51_500,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
        intradayHighProfit: 0,
        peakDayCloseProfit: 0,
        peakIntradayProfit: 0,
        qualifyingDays: tradingDays,
        startingBalance: 50_000,
        threshold: 48_000,
        thresholdLocked: false,
        todayPnL: 0,
        tradingDays,
    };
}

function sweepsOf(
    advisor: FundedSizingAdvisor,
    hazard: number | undefined,
): readonly EngineOptimumRunnerResult[] {
    return advisor.optimumRequests().flatMap((request) =>
        request.source === AdviceSource.FundedSweepFresh ||
        request.source === AdviceSource.FundedSweepFromState
            ? [
                  runEngineOptimum(PLAN, {
                      ...request,
                      base: {
                          ...request.base,
                          liveTransferHazard:
                              hazard === undefined
                                  ? undefined
                                  : fraction(hazard),
                      },
                  }),
              ]
            : [],
    );
}

function trackerOf(state: AccountState): FundedCycleTracker {
    return newFundedCycleTracker({ ...state, balance: state.startingBalance });
}

describe('FundedSizingAdvisor forwards the live-transfer assumption of its sweeps (PT-73g step 3)', () => {
    describe('with a hazard in the base inputs and an account with history', () => {
        const advisor = advisorOf(20);
        let results: readonly EngineOptimumRunnerResult[];
        let advice: Advice;

        beforeAll(() => {
            results = sweepsOf(advisor, HAZARD);
            advice = advisor.assemble(results);
        });

        it('appends the fresh sweep assumption', () => {
            const { liveTransfer } = freshOf(results);

            expect(liveTransfer).toBeDefined();
            expect(advice.assumptions).toContainEqual(liveTransfer);
        });

        it('appends the from-state optimum assumption', () => {
            const { sweep } = fromStateOf(results);
            if (sweep.kind !== FundedFromStateOptimumResultKind.Optimum) {
                throw new Error('expected a from-state optimum');
            }

            expect(sweep.optimum.liveTransfer).toBeDefined();
            expect(advice.assumptions).toContainEqual(
                sweep.optimum.liveTransfer,
            );
        });

        it('never lists the same assumption text twice', () => {
            const lines = hazardAssumptionsOf(advice).map((assumption) =>
                JSON.stringify(assumption),
            );

            expect(new Set(lines).size).toBe(lines.length);
        });
    });

    describe('with a hazard and an account with no history (only the fresh sweep runs)', () => {
        it('appends the fresh sweep assumption alone', () => {
            const advisor = advisorOf(0);
            const results = sweepsOf(advisor, HAZARD);
            const advice = advisor.assemble(results);

            expect(
                results.some(
                    (result) =>
                        result.source === AdviceSource.FundedSweepFromState,
                ),
            ).toBe(false);
            expect(hazardAssumptionsOf(advice)).toStrictEqual([
                freshOf(results).liveTransfer,
            ]);
        });
    });

    describe('without a hazard in the base inputs', () => {
        it('appends no live-transfer assumption', () => {
            const advisor = advisorOf(20);
            const advice = advisor.assemble(sweepsOf(advisor, undefined));

            expect(hazardAssumptionsOf(advice)).toStrictEqual([]);
        });
    });

    describe('through the real advisor path with a hazard in the rulebook and no injected base', () => {
        const advisor = advisorOf(20, HAZARD_RULEBOOK);
        let advice: Advice;

        beforeAll(() => {
            advice = advisor.assemble(pricedSweepsOf(advisor));
        });

        it('prices the hazard in the sweeps, so it lists the hazard assumption and never says it is not priced', () => {
            expect(hazardAssumptionsOf(advice).length).toBeGreaterThan(0);
            expect(notPricedCountOf(advice)).toBe(0);
        });

        it('does the same for an account with no history', () => {
            const fresh = advisorOf(0, HAZARD_RULEBOOK);
            const freshAdvice = fresh.assemble(pricedSweepsOf(fresh));

            expect(hazardAssumptionsOf(freshAdvice).length).toBeGreaterThan(0);
            expect(notPricedCountOf(freshAdvice)).toBe(0);
        });

        it('says nothing about a hazard that is priced', () => {
            const priced = advisor.assemble(sweepsOf(advisor, HAZARD));

            expect(notPricedCountOf(priced)).toBe(0);
            expect(hazardAssumptionsOf(priced).length).toBeGreaterThan(0);
        });
    });

    describe('through the real advisor path with no hazard in the rulebook', () => {
        it('says nothing about live transfer', () => {
            const advisor = advisorOf(20);
            const advice = advisor.assemble(sweepsOf(advisor, undefined));

            expect(notPricedCountOf(advice)).toBe(0);
            expect(hazardAssumptionsOf(advice)).toStrictEqual([]);
        });
    });
});
