import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    ApexVariant,
    ConductCategory,
    type ConductPattern,
    findFirm,
    FirmAccountPolicy,
    FirmId,
    type FundedCycleTracker,
    InstrumentSymbol,
    type LadderScore,
    newFundedCycleTracker,
    type Plan,
    type PlanId,
    PolicySourceKind,
    PolicyVerification,
    serializePlanId,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AdviceSource,
    DEFAULT_RULEBOOK,
    DifferenceReason,
    type DifferenceReasonDetail,
    differenceReasonText,
    type EngineOptimumRunnerResult,
    EvalSizingAdvisor,
    FundedFromStateOptimumResultKind,
    FundedSizingAdvisor,
    FundedSweepOptimumResultKind,
    LadderEngineOptimumResultKind,
    NO_PENDING_PAYOUT_COUNTS,
    type ReconstructedFundedOrEvalAccount,
    runEngineOptimum,
} from '~/lib/prop-calculator/advisor';

const VERIFIED_QUOTE = 'a synthetic verified conduct quote';

const CONFIRMED_SOURCE = {
    fetchedOn: '2026-09-01',
    quote: VERIFIED_QUOTE,
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Confirmed,
} as const;

const AGGRESSIVE_CONFIRMED: ConductPattern = {
    category: ConductCategory.InconsistentSizing,
    consequence: 'inconsistent position sizing review',
    source: CONFIRMED_SOURCE,
};

const AGGRESSIVE_UNVERIFIED: ConductPattern = {
    category: ConductCategory.NewsSizing,
    consequence: 'news-time sizing review',
    source: { verification: PolicyVerification.NeedsPaste },
};

const REBUY_CONFIRMED: ConductPattern = {
    category: ConductCategory.RapidRebuys,
    consequence: 'rapid rebuy review',
    source: CONFIRMED_SOURCE,
};

class StubConductPolicy extends FirmAccountPolicy {
    constructor(private readonly patterns: readonly ConductPattern[]) {
        super();
    }

    override conductPatterns(): readonly ConductPattern[] {
        return this.patterns;
    }
}

const APEX_EOD_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
};

const TOPSTEP_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
};

function churnAt(
    advisor: EvalSizingAdvisor | FundedSizingAdvisor,
    results: readonly EngineOptimumRunnerResult[],
) {
    return churnReasons(advisor.assemble(results).differenceReasons);
}

function evalAccount(): ReconstructedFundedOrEvalAccount {
    const state = evalState();
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: null,
        kind: TradingPhase.Eval,
        plan: apexPlan,
        resolvedDailyLossLimit: null,
        state,
        ...NO_PENDING_PAYOUT_COUNTS,
    };
}

function evalAdvisor(accountPolicy?: FirmAccountPolicy): EvalSizingAdvisor {
    return new EvalSizingAdvisor({
        account: evalAccount(),
        accountPolicy,
        maxEvalDays: 150,
        rulebook: DEFAULT_RULEBOOK,
        sims: 200,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
    });
}

function evalState(): AccountState {
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
    };
}

function fundedAccount(): ReconstructedFundedOrEvalAccount {
    const state = fundedState();
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: fundedTracker(state),
        kind: TradingPhase.Funded,
        plan: topStepPlan,
        resolvedDailyLossLimit: null,
        state,
        ...NO_PENDING_PAYOUT_COUNTS,
    };
}

function fundedAdvisor(
    accountPolicy?: FirmAccountPolicy,
    positionSizing?: { instrument: InstrumentSymbol; stopPoints: number },
): FundedSizingAdvisor {
    return new FundedSizingAdvisor({
        account: fundedAccount(),
        accountPolicy,
        fundedHorizonDays: 252,
        positionSizing,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
        trials: 20,
    });
}

function fundedState(): AccountState {
    return {
        balance: 51_500,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
        intradayHighProfit: 0,
        peakDayCloseProfit: 0,
        peakIntradayProfit: 0,
        qualifyingDays: 20,
        startingBalance: 50_000,
        threshold: 48_000,
        thresholdLocked: false,
        todayPnL: 0,
        tradingDays: 20,
    };
}

function fundedTracker(state: AccountState): FundedCycleTracker {
    return newFundedCycleTracker({ ...state, balance: state.startingBalance });
}

function ladderWinner(
    ladder: readonly number[] = [300, 400, 500],
): LadderScore {
    return {
        costPerFunded: 1,
        costPerFundedStandardError: 0,
        expectedDaysToFunded: 1,
        expectedDaysToFundedStandardError: 0,
        ladder: [...ladder],
        meanDaysOnFail: 3,
        meanDaysOnPass: 8,
        passRate: 0.4,
        passRateStandardError: 0.01,
    };
}

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

const apexPlan = registryPlan(APEX_EOD_ID);
const topStepPlan = registryPlan(TOPSTEP_ID);

function churnReasons(
    reasons: readonly DifferenceReasonDetail[],
): readonly Extract<
    DifferenceReasonDetail,
    { kind: DifferenceReason.AggressiveOptimumChurn }
>[] {
    return reasons.flatMap((reason) =>
        reason.kind === DifferenceReason.AggressiveOptimumChurn ? [reason] : [],
    );
}

function scoredLadderResults(ladder?: readonly number[]) {
    const winner = ladderWinner(ladder);
    const ranked = [winner];
    return [
        {
            kind: LadderEngineOptimumResultKind.Scored,
            ladder: {
                byCost: ranked,
                byPassRate: ranked,
                bySpeed: ranked,
                droppedAliasCount: 0,
                frontier: ranked,
                gridSize: 1,
                laddersScored: 1,
                topN: 10,
                unscorableCount: 0,
            },
            source: AdviceSource.LadderSearchFresh,
        } as const,
    ];
}

describe('EvalSizingAdvisor.assemble AggressiveOptimumChurn (PT-19g, F-124)', () => {
    it('attaches the verified aggressive-sizing pattern with its quote to a scored ladder optimum', () => {
        const advisor = evalAdvisor(
            new StubConductPolicy([AGGRESSIVE_CONFIRMED]),
        );

        const reasons = churnReasons(
            advisor.assemble(scoredLadderResults()).differenceReasons,
        );

        expect(reasons).toHaveLength(1);
        expect(reasons[0]?.pattern).toBe(AGGRESSIVE_CONFIRMED);
        expect(
            differenceReasonText(
                reasons[0] ?? { kind: DifferenceReason.AssumedInputs },
            ),
        ).toContain(VERIFIED_QUOTE);
    });

    it('stays silent when the ladder optimum is no riskier than the documented ladder', () => {
        const advisor = evalAdvisor(
            new StubConductPolicy([AGGRESSIVE_CONFIRMED]),
        );
        const documentedRisks = (advisor.documented()?.rungs ?? []).map(
            (rung) => rung.risk,
        );
        expect(documentedRisks.length).toBeGreaterThan(0);
        const peak = Math.max(...documentedRisks);

        for (const ladder of [documentedRisks, [peak], [peak - 100, 100]]) {
            expect(churnAt(advisor, scoredLadderResults(ladder))).toEqual([]);
        }
    });

    it('attaches the pattern when the ladder optimum places a larger single risk than the documented ladder', () => {
        const advisor = evalAdvisor(
            new StubConductPolicy([AGGRESSIVE_CONFIRMED]),
        );
        const peak = Math.max(
            ...(advisor.documented()?.rungs ?? []).map((rung) => rung.risk),
        );

        const reasons = churnReasons(
            advisor.assemble(scoredLadderResults([100, peak + 100]))
                .differenceReasons,
        );

        expect(reasons).toHaveLength(1);
    });

    it('stays silent without a verified aggressive-sizing pattern', () => {
        const results = scoredLadderResults();

        for (const policy of [
            undefined,
            new StubConductPolicy([]),
            new StubConductPolicy([AGGRESSIVE_UNVERIFIED]),
            new StubConductPolicy([REBUY_CONFIRMED]),
        ]) {
            expect(
                churnReasons(
                    evalAdvisor(policy).assemble(results).differenceReasons,
                ),
            ).toEqual([]);
        }
    });

    it('stays silent when no engine optimum is present, whatever the firm publishes', () => {
        const advisor = evalAdvisor(
            new StubConductPolicy([AGGRESSIVE_CONFIRMED]),
        );

        expect(churnReasons(advisor.assemble([]).differenceReasons)).toEqual(
            [],
        );
    });
});

function fundedResultsOf(
    advisor: FundedSizingAdvisor,
): readonly EngineOptimumRunnerResult[] {
    return advisor
        .optimumRequests()
        .map((request) => runEngineOptimum(topStepPlan, request));
}

function relabelledWinner(
    results: readonly EngineOptimumRunnerResult[],
    label: string,
): readonly EngineOptimumRunnerResult[] {
    return results.map((result) => {
        if (
            result.source === AdviceSource.FundedSweepFresh &&
            result.sweep.kind === FundedSweepOptimumResultKind.Optimum
        ) {
            return {
                source: result.source,
                sweep: {
                    kind: result.sweep.kind,
                    optimum: { ...result.sweep.optimum, label },
                },
            };
        }
        if (
            result.source === AdviceSource.FundedSweepFromState &&
            result.sweep.kind === FundedFromStateOptimumResultKind.Optimum
        ) {
            return {
                source: result.source,
                sweep: {
                    kind: result.sweep.kind,
                    optimum: { ...result.sweep.optimum, label },
                },
            };
        }
        return result;
    });
}

describe('FundedSizingAdvisor.assemble AggressiveOptimumChurn (PT-19g, F-124)', () => {
    it('attaches each verified aggressive-sizing pattern once to a funded sweep optimum riskier than the documented rule', () => {
        const advisor = fundedAdvisor(
            new StubConductPolicy([
                AGGRESSIVE_CONFIRMED,
                AGGRESSIVE_UNVERIFIED,
                REBUY_CONFIRMED,
            ]),
        );
        const results = relabelledWinner(fundedResultsOf(advisor), 'flat $500');

        const reasons = churnReasons(
            advisor.assemble(results).differenceReasons,
        );

        expect(reasons).toHaveLength(1);
        expect(reasons[0]?.pattern).toBe(AGGRESSIVE_CONFIRMED);
    });

    it('stays silent when the funded sweep optimum is no riskier than the documented rule', () => {
        const advisor = fundedAdvisor(
            new StubConductPolicy([AGGRESSIVE_CONFIRMED]),
        );
        const results = fundedResultsOf(advisor);

        for (const label of ['flat $250', 'flat $150']) {
            expect(churnAt(advisor, relabelledWinner(results, label))).toEqual(
                [],
            );
        }
    });

    it('stays silent when the optimum label matches no built candidate', () => {
        const advisor = fundedAdvisor(
            new StubConductPolicy([AGGRESSIVE_CONFIRMED]),
        );
        const results = relabelledWinner(
            fundedResultsOf(advisor),
            'flat $9999',
        );

        expect(
            churnReasons(advisor.assemble(results).differenceReasons),
        ).toEqual([]);
    });

    it('compares a percent-of-cushion optimum at the current cushion', () => {
        const advisor = fundedAdvisor(
            new StubConductPolicy([AGGRESSIVE_CONFIRMED]),
            { instrument: InstrumentSymbol.MNQ, stopPoints: 10 },
        );
        const results = fundedResultsOf(advisor);

        expect(
            churnAt(advisor, relabelledWinner(results, '15% cushion')),
        ).toHaveLength(1);
        expect(
            churnAt(advisor, relabelledWinner(results, '5% cushion')),
        ).toEqual([]);
    });

    it('stays silent without a verified pattern or without a sweep optimum', () => {
        const results = relabelledWinner(
            fundedResultsOf(fundedAdvisor()),
            'flat $500',
        );

        expect(
            churnReasons(fundedAdvisor().assemble(results).differenceReasons),
        ).toEqual([]);
        const withPattern = fundedAdvisor(
            new StubConductPolicy([AGGRESSIVE_CONFIRMED]),
        );
        expect(
            churnReasons(withPattern.assemble([]).differenceReasons),
        ).toEqual([]);
    });
});
