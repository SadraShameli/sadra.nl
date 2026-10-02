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
    type DifferenceReasonDetail,
    EvalSizingAdvisor,
    type LadderEngineOptimumResult,
    LadderEngineOptimumResultKind,
    type ReconstructedFundedOrEvalAccount,
    runEngineOptimum,
} from '~/lib/prop-calculator/advisor';

const APEX_EOD_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
};

const LADDER_REASON_KINDS: ReadonlySet<DifferenceReason> = new Set([
    DifferenceReason.DocumentedLadderNeverFunded,
    DifferenceReason.DocumentedLadderNotScored,
    DifferenceReason.WithinNoise,
]);

const SIMS = 200;
const DEFAULT_SIMS = 4000;

function account(state: AccountState): ReconstructedFundedOrEvalAccount {
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
    options: {
        readonly sims?: number;
        readonly snapshotAsOf?: string;
        readonly state?: AccountState;
    } = {},
): EvalSizingAdvisor {
    return new EvalSizingAdvisor({
        account: account(options.state ?? accountState()),
        maxEvalDays: 150,
        rulebook: DEFAULT_RULEBOOK,
        sims: options.sims,
        snapshotAsOf: options.snapshotAsOf ?? '2026-09-26',
        substate: null,
        today: '2026-09-26',
    });
}

function ladderReasonsOf(
    reasons: readonly DifferenceReasonDetail[],
): readonly DifferenceReasonDetail[] {
    return reasons.filter((reason) => LADDER_REASON_KINDS.has(reason.kind));
}

function ladderResult(winner: LadderScore): LadderSearchResult {
    return {
        byCost: [winner],
        byPassRate: [winner],
        bySpeed: [winner],
        droppedAliasCount: 0,
        frontier: [winner],
        gridSize: 1,
        laddersScored: 1,
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

function reasonsFor(
    advisor: EvalSizingAdvisor,
    optimum: LadderScore,
    documentedScore?: LadderScore,
    source:
        | AdviceSource.LadderSearchFresh
        | AdviceSource.LadderSearchFromState = AdviceSource.LadderSearchFresh,
): readonly DifferenceReasonDetail[] {
    const result: LadderEngineOptimumResult = {
        ...(documentedScore !== undefined && { documentedScore }),
        kind: LadderEngineOptimumResultKind.Scored,
        ladder: ladderResult(optimum),
        source,
    };
    return ladderReasonsOf(advisor.assemble([result]).differenceReasons);
}

function score(overrides: Partial<LadderScore> = {}): LadderScore {
    return {
        costPerFunded: 400,
        costPerFundedStandardError: 1,
        expectedDaysToFunded: 8,
        expectedDaysToFundedStandardError: 0.1,
        ladder: [300, 400, 500],
        meanDaysOnFail: 3,
        meanDaysOnPass: 8,
        passRate: 0.4,
        passRateStandardError: 0.01,
        ...overrides,
    };
}

const NEVER_FUNDED = score({
    costPerFunded: Infinity,
    costPerFundedStandardError: Infinity,
    expectedDaysToFunded: Infinity,
    expectedDaysToFundedStandardError: Infinity,
    passRate: 0,
});

describe('EvalSizingAdvisor documented-ladder reasons (PT-19i, F-119)', () => {
    it('proves the fixture requests a documented ladder', () => {
        const [request] = advisorAt().optimumRequests();
        expect(request?.source).toBe(AdviceSource.LadderSearchFresh);
        expect(
            request?.source === AdviceSource.LadderSearchFresh &&
                request.documentedLadder !== undefined,
        ).toBe(true);
    });

    it('says the documented ladder never funded when the optimum is finite and the documented score is not', () => {
        expect(
            reasonsFor(advisorAt({ sims: SIMS }), score(), NEVER_FUNDED),
        ).toEqual([
            {
                kind: DifferenceReason.DocumentedLadderNeverFunded,
                sims: SIMS,
            },
        ]);
    });

    it('says it when only one of the documented cost and days is non-finite', () => {
        for (const documented of [
            score({ costPerFunded: Infinity }),
            score({ expectedDaysToFunded: Infinity }),
            score({ expectedDaysToFunded: NaN }),
        ]) {
            expect(
                reasonsFor(advisorAt({ sims: SIMS }), score(), documented).map(
                    (reason) => reason.kind,
                ),
            ).toEqual([DifferenceReason.DocumentedLadderNeverFunded]);
        }
    });

    it('says the documented ladder was not scored when one was requested and the result carries no score', () => {
        expect(reasonsFor(advisorAt({ sims: SIMS }), score())).toEqual([
            {
                kind: DifferenceReason.DocumentedLadderNotScored,
                sims: SIMS,
            },
        ]);
    });

    it('reports the default simulation count when the advisor has none of its own', () => {
        expect(reasonsFor(advisorAt(), score())).toEqual([
            {
                kind: DifferenceReason.DocumentedLadderNotScored,
                sims: DEFAULT_SIMS,
            },
        ]);
    });

    it('says it for a from-state ladder result as well', () => {
        const advisor = advisorAt({
            sims: SIMS,
            state: accountState({ elapsedDays: 3 }),
        });

        expect(
            reasonsFor(
                advisor,
                score(),
                NEVER_FUNDED,
                AdviceSource.LadderSearchFromState,
            ).map((reason) => reason.kind),
        ).toEqual([DifferenceReason.DocumentedLadderNeverFunded]);
    });

    it('says the documented ladder never funded when the engine best ladder never funds either (PT-36f)', () => {
        expect(
            reasonsFor(advisorAt({ sims: SIMS }), NEVER_FUNDED, NEVER_FUNDED),
        ).toEqual([
            {
                kind: DifferenceReason.DocumentedLadderNeverFunded,
                sims: SIMS,
            },
        ]);
    });

    it('says the documented ladder was not scored when the engine best ladder never funds and the result carries no documented score (PT-36f)', () => {
        expect(reasonsFor(advisorAt({ sims: SIMS }), NEVER_FUNDED)).toEqual([
            {
                kind: DifferenceReason.DocumentedLadderNotScored,
                sims: SIMS,
            },
        ]);
    });

    it('stays silent when the engine best ladder never funds but the documented ladder did: the two cannot be compared (PT-36f)', () => {
        expect(
            reasonsFor(advisorAt({ sims: SIMS }), NEVER_FUNDED, score()),
        ).toEqual([]);
    });

    it('stays silent for an engine best ladder that never funds when no documented ladder was requested (PT-36f)', () => {
        const stale = advisorAt({ sims: SIMS, snapshotAsOf: '2026-09-01' });

        expect(reasonsFor(stale, NEVER_FUNDED)).toEqual([]);
    });

    it('stays silent when no documented ladder was requested', () => {
        const stale = advisorAt({
            sims: SIMS,
            snapshotAsOf: '2026-09-01',
        });
        expect(stale.documented()).toBeNull();

        expect(reasonsFor(stale, score())).toEqual([]);
    });

    it('stays silent for a finite documented score that differs from the optimum, and keeps WithinNoise for one that does not', () => {
        const worse = score({
            costPerFunded: 4000,
            expectedDaysToFunded: 80,
        });
        expect(reasonsFor(advisorAt({ sims: SIMS }), score(), worse)).toEqual(
            [],
        );
        expect(
            reasonsFor(advisorAt({ sims: SIMS }), score(), score()).map(
                (reason) => reason.kind,
            ),
        ).toEqual([DifferenceReason.WithinNoise]);
    });

    it('says an oversized documented ladder never funded when the real engine runs it beside a finite optimum', () => {
        const rulebook = {
            ...DEFAULT_RULEBOOK,
            eval: {
                ...DEFAULT_RULEBOOK.eval,
                generalDerivation: { escalation: 3, firstRungFraction: 1 },
            },
            strategy: { ...DEFAULT_RULEBOOK.strategy, rr: 0.6, winrate: 0.5 },
        };
        const advisor = new EvalSizingAdvisor({
            account: account(accountState()),
            maxEvalDays: 150,
            rulebook,
            sims: 40,
            snapshotAsOf: '2026-09-26',
            substate: null,
            today: '2026-09-26',
        });
        const results = advisor
            .optimumRequests()
            .map((request) => runEngineOptimum(plan, request));
        const [scored] = results;
        if (
            scored?.source !== AdviceSource.LadderSearchFresh ||
            scored.kind !== LadderEngineOptimumResultKind.Scored
        ) {
            throw new Error('expected a scored fresh ladder result');
        }
        expect(scored.documentedScore?.passRate).toBe(0);
        expect(scored.documentedScore?.costPerFunded).toBe(Infinity);
        expect(scored.ladder.bySpeed[0]?.costPerFunded).toBeLessThan(Infinity);

        expect(
            ladderReasonsOf(advisor.assemble(results).differenceReasons),
        ).toEqual([
            { kind: DifferenceReason.DocumentedLadderNeverFunded, sims: 40 },
        ]);
    }, 60_000);
});
