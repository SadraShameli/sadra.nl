import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    ApexVariant,
    findFirm,
    FirmId,
    type LadderScore,
    type LadderSearchResult,
    type Plan,
    type PlanId,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AdviceSource,
    DEFAULT_RULEBOOK,
    DifferenceReason,
    differenceReasonText,
    EvalSizingAdvisor,
    type LadderEngineOptimumResult,
    LadderEngineOptimumResultKind,
    LadderRefusalKind,
    type ReconstructedFundedOrEvalAccount,
} from '~/lib/prop-calculator/advisor';
import { NOISE_STANDARD_ERRORS } from '~/lib/prop-calculator/stats';

const APEX_EOD_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
};

const HUGE_STANDARD_ERROR = 1e9;

function account(
    state: AccountState = accountState(),
): ReconstructedFundedOrEvalAccount {
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: null,
        kind: TradingPhase.Eval,
        plan,
        resolvedDailyLossLimit: null,
        state,
    };
}

function accountState(overrides: Partial<AccountState> = {}): AccountState {
    return {
        balance: 52_000,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
        elapsedDays: 0,
        intradayHighProfit: 0,
        peakDayCloseProfit: 0,
        peakIntradayProfit: 0,
        qualifyingDays: 0,
        startingBalance: 50_000,
        threshold: 50_000,
        thresholdLocked: false,
        todayPnL: 0,
        tradingDays: 0,
        ...overrides,
    };
}

function advisorAt(
    state: AccountState = accountState(),
    sims = 200,
): EvalSizingAdvisor {
    return new EvalSizingAdvisor({
        account: account(state),
        maxEvalDays: 150,
        rulebook: DEFAULT_RULEBOOK,
        sims,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
    });
}

function ladderResult(winner: LadderScore | null): LadderSearchResult {
    const scores = winner === null ? [] : [winner];
    return {
        byCost: scores,
        byPassRate: scores,
        bySpeed: scores,
        droppedAliasCount: 0,
        frontier: scores,
        gridSize: scores.length,
        laddersScored: scores.length,
        topN: 10,
        unscorableCount: 0,
    };
}

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

const plan = registryPlan(APEX_EOD_ID);

function score(overrides: Partial<LadderScore> = {}): LadderScore {
    return {
        costPerFunded: 400,
        costPerFundedStandardError: 0,
        expectedDaysToFunded: 8,
        expectedDaysToFundedStandardError: 0,
        ladder: [300, 400, 500],
        meanDaysOnFail: 3,
        meanDaysOnPass: 8,
        passRate: 0.4,
        passRateStandardError: 0.01,
        ...overrides,
    };
}

function scoredResult(
    winner: LadderScore | null,
    source:
        | AdviceSource.LadderSearchFresh
        | AdviceSource.LadderSearchFromState = AdviceSource.LadderSearchFresh,
    documentedScore: LadderScore = score({
        costPerFundedStandardError: 1,
        expectedDaysToFundedStandardError: 0.1,
    }),
): LadderEngineOptimumResult {
    return {
        documentedScore,
        kind: LadderEngineOptimumResultKind.Scored,
        ladder: ladderResult(winner),
        source,
    };
}

function withinNoiseReasons(
    advisor: EvalSizingAdvisor,
    winner: LadderScore,
    documentedScore?: LadderScore,
) {
    return advisor
        .assemble([
            scoredResult(winner, AdviceSource.LadderSearchFresh, documentedScore),
        ])
        .differenceReasons.flatMap((reason) =>
            reason.kind === DifferenceReason.WithinNoise ? [reason] : [],
        );
}

describe('EvalSizingAdvisor.assemble WithinNoise on the ladder result (PT-19g, F-119)', () => {
    it('says the documented ladder and the optimum are the same when both cost and days differ by less than the combined noise', () => {
        const advisor = advisorAt();
        const optimum = score({
            costPerFundedStandardError: HUGE_STANDARD_ERROR,
            expectedDaysToFundedStandardError: HUGE_STANDARD_ERROR,
        });

        const reasons = withinNoiseReasons(
            advisor,
            optimum,
            score({
                costPerFundedStandardError: 1e6,
                expectedDaysToFundedStandardError: 1e6,
            }),
        );

        expect(reasons).toHaveLength(1);
        const [reason] = reasons;
        expect(reason?.threshold).toBeGreaterThan(
            NOISE_STANDARD_ERRORS * HUGE_STANDARD_ERROR,
        );
        expect(reason?.gap).toBeGreaterThanOrEqual(0);
        expect(reason?.gap ?? Infinity).toBeLessThanOrEqual(
            reason?.threshold ?? 0,
        );
        expect(
            differenceReasonText(
                reason ?? { kind: DifferenceReason.AssumedInputs },
            ),
        ).toContain('within');
    });

    it('stays silent when the optimum beats the documented ladder by more than the combined noise', () => {
        const optimum = score({
            costPerFunded: 1,
            expectedDaysToFunded: 1,
        });

        expect(withinNoiseReasons(advisorAt(), optimum)).toEqual([]);
    });

    it('stays silent when cost is within noise but the days to funded are not', () => {
        const optimum = score({
            costPerFundedStandardError: HUGE_STANDARD_ERROR,
            expectedDaysToFunded: 0.001,
            expectedDaysToFundedStandardError: 0,
        });

        expect(withinNoiseReasons(advisorAt(), optimum)).toEqual([]);
    });

    it('never claims noise without a finite standard error, and never throws on one', () => {
        const unmeasured = score({
            costPerFundedStandardError: Infinity,
            expectedDaysToFundedStandardError: Infinity,
        });
        const unscorable = score({
            costPerFunded: Infinity,
            costPerFundedStandardError: Infinity,
        });

        expect(withinNoiseReasons(advisorAt(), unmeasured)).toEqual([]);
        expect(withinNoiseReasons(advisorAt(), unscorable)).toEqual([]);
    });

    it('stays silent with no ladder result, a refused ladder, or an empty ladder result', () => {
        const advisor = advisorAt();
        const refused: LadderEngineOptimumResult = {
            kind: LadderEngineOptimumResultKind.Refused,
            refusal: {
                kind: LadderRefusalKind.GridTooLarge,
                limit: 10,
                size: 100,
            },
            source: AdviceSource.LadderSearchFresh,
        };

        for (const results of [
            [],
            [refused],
            [scoredResult(null)],
        ] as readonly (readonly LadderEngineOptimumResult[])[]) {
            expect(
                advisor
                    .assemble(results)
                    .differenceReasons.some(
                        (reason) =>
                            reason.kind === DifferenceReason.WithinNoise,
                    ),
            ).toBe(false);
        }
    });

    it('compares from the mid-eval state for a from-state ladder result and is deterministic', () => {
        const advisor = advisorAt(accountState({ elapsedDays: 3 }));
        const optimum = score({
            costPerFundedStandardError: HUGE_STANDARD_ERROR,
            expectedDaysToFundedStandardError: HUGE_STANDARD_ERROR,
        });
        const results = [
            scoredResult(optimum, AdviceSource.LadderSearchFromState),
        ];

        const first = advisor.assemble(results).differenceReasons;
        const second = advisor.assemble(results).differenceReasons;

        expect(
            first.filter(
                (reason) => reason.kind === DifferenceReason.WithinNoise,
            ),
        ).toHaveLength(1);
        expect(second).toEqual(first);
    });
});
