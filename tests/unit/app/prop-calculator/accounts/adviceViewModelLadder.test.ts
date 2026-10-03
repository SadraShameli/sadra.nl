import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    AdviceDisplayKind,
    adviceViewModel,
    OptimumFigureKind,
    OptimumRowStatus,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/adviceViewModel';
import {
    type AccountState,
    ApexVariant,
    findFirm,
    FirmId,
    type LadderScore,
    type Plan,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AdviceSource,
    AssumptionBias,
    DEFAULT_RULEBOOK,
    EvalSizingAdvisor,
    LadderEngineOptimumResultKind,
    type LadderScoredEngineOptimumResult,
    ladderStepWidenedAssumption,
    NO_PENDING_PAYOUT_COUNTS,
    type ReconstructedFundedOrEvalAccount,
    runEngineOptimum,
} from '~/lib/prop-calculator/advisor';

import { NO_PERSONAL_LIMITS } from './personalLimitsFixture';

const APEX_EOD_ID = {
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
} as const;

function freshEvalAdvisor(cushion: number, elapsedDays = 0): EvalSizingAdvisor {
    const state: AccountState = {
        balance: 50_000 + cushion,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
        elapsedDays,
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
    const account: ReconstructedFundedOrEvalAccount = {
        assumptions: [],
        contractLimit: null,
        cushion,
        fundedTracker: null,
        kind: TradingPhase.Eval,
        plan: registryPlan(),
        resolvedDailyLossLimit: null,
        state,
        ...NO_PENDING_PAYOUT_COUNTS,
    };
    return new EvalSizingAdvisor({
        account,
        maxEvalDays: 150,
        rulebook: DEFAULT_RULEBOOK,
        sims: 5,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
    });
}

function readyViewOf(advice: ReturnType<EvalSizingAdvisor['assemble']>) {
    const view = adviceViewModel(advice, NO_PERSONAL_LIMITS);
    if (view.kind !== AdviceDisplayKind.Ready) {
        throw new Error('expected ready advice');
    }
    return view;
}

function registryPlan(): Plan {
    const found = findFirm(APEX_EOD_ID.firm)?.findPlan(APEX_EOD_ID);
    if (!found) throw new Error(`${serializePlanId(APEX_EOD_ID)} missing`);
    return found;
}

describe('the advice view model states a widened ladder step (PT-24d, F-133)', () => {
    it('a fresh 50K eval with a $2,000 cushion lists the widened step with its size', () => {
        const advisor = freshEvalAdvisor(2000);

        const view = readyViewOf(advisor.assemble([]));

        const widened = view.assumptions.find((assumption) =>
            assumption.text.includes('coarser'),
        );
        expect(widened).toBeDefined();
        expect(widened?.text).toContain('$140');
    });

    it('a $1,500 cushion keeps the $100 step and lists no widened-step text', () => {
        const view = readyViewOf(freshEvalAdvisor(1500).assemble([]));

        expect(
            view.assumptions.some((assumption) =>
                assumption.text.includes('coarser'),
            ),
        ).toBe(false);
    });

    it('says the step from the assumption itself, with no engine requests on the advice', () => {
        const advice = freshEvalAdvisor(2000).assemble([]);

        const view = readyViewOf({ ...advice, requests: [] });

        const widened = view.assumptions.find((assumption) =>
            assumption.text.includes('coarser'),
        );
        expect(widened?.text).toContain('The grid step is $140.');
        expect(widened?.text).not.toContain('searched');
    });

    it('says the step the assumption carries, not one read from the requests', () => {
        const advice = freshEvalAdvisor(2000).assemble([]);

        const view = readyViewOf({
            ...advice,
            assumptions: [
                ladderStepWidenedAssumption(175, AssumptionBias.Neutral),
            ],
        });

        const widened = view.assumptions.find((assumption) =>
            assumption.text.includes('coarser'),
        );
        expect(widened?.text).toContain('The grid step is $175.');
    });
});

describe('the advice view model shows a refused ladder search (PT-24d, F-133)', () => {
    it('renders a left-out row that says the ladder search was not run because the grid is too large', () => {
        const advisor = freshEvalAdvisor(2000);
        const requests = advisor.optimumRequests().map((request) => ({
            ...request,
            maxGridSize: 10,
        }));
        const results = requests.map((request) =>
            runEngineOptimum(registryPlan(), request),
        );

        const view = readyViewOf(advisor.assemble(results));

        const row = view.optima.find(
            (candidate) => candidate.source === AdviceSource.LadderSearchFresh,
        );
        expect(row?.status).toBe(OptimumRowStatus.LeftOut);
        expect(row?.text).toContain('ladder search not run: grid too large');
        expect(row?.text).toContain('1,554');
        expect(row?.text).toContain('10');
        expect(row?.text).not.toContain('No ladder scored');
    });
});

const WINNER: LadderScore = {
    costPerFunded: 264,
    costPerFundedStandardError: 12.5,
    expectedDaysToFunded: 5.5,
    expectedDaysToFundedStandardError: 0.3,
    ladder: [400, 600, 900, 100],
    meanDaysOnFail: 3,
    meanDaysOnPass: 6,
    passRate: 0.428,
    passRateStandardError: 0.011,
};

const FRESH_ATTEMPT = {
    meanDaysOnFail: 4,
    meanDaysOnPass: 8,
    passRate: 0.31,
    passRateStandardError: 0.02,
};

function ladderRowOf(result: LadderScoredEngineOptimumResult, elapsedDays = 0) {
    const view = readyViewOf(
        freshEvalAdvisor(1500, elapsedDays).assemble([result]),
    );
    const [row] = view.optima;
    if (row === undefined) throw new Error('expected a ladder row');
    return row;
}

function scoredResult(
    source: LadderScoredEngineOptimumResult['source'],
    scores: readonly LadderScore[],
    unscorableCount = 0,
): LadderScoredEngineOptimumResult {
    return {
        kind: LadderEngineOptimumResultKind.Scored,
        ladder: {
            byCost: scores,
            byPassRate: scores,
            bySpeed: scores,
            droppedAliasCount: 0,
            frontier: scores,
            gridSize: 12,
            laddersScored: 12,
            topN: 25,
            unscorableCount,
        },
        source,
    };
}

describe('the ladder row names the ladder and every standard error (PT-108 step 1, F-119, F-120)', () => {
    it('prints the winning rungs and carries a standard error for the pass rate, the days and the cost', () => {
        const row = ladderRowOf(
            scoredResult(AdviceSource.LadderSearchFresh, [WINNER]),
        );

        expect(row.text).toContain('ladder $400, $600, $900, $100');
        expect(row.figures.map((figure) => figure.kind)).toEqual([
            OptimumFigureKind.PassRate,
            OptimumFigureKind.DaysToFunded,
            OptimumFigureKind.CostPerFunded,
        ]);
        expect(row.figures.map((figure) => figure.standardError)).toEqual([
            0.011, 0.3, 12.5,
        ]);
        expect(row.figures.map((figure) => figure.standardErrorText)).toEqual([
            '1.1%',
            '0.3',
            '$12.50',
        ]);
    });

    it('keeps a fractional rung to the cent', () => {
        const row = ladderRowOf(
            scoredResult(AdviceSource.LadderSearchFresh, [
                { ...WINNER, ladder: [140.5, 280] },
            ]),
        );

        expect(row.text).toContain('ladder $140.50, $280');
    });

    it('says all ladders were unscorable instead of "No ladder scored" when none passed often enough', () => {
        const row = ladderRowOf(
            scoredResult(AdviceSource.LadderSearchFresh, [], 12),
        );

        expect(row.status).toBe(OptimumRowStatus.LeftOut);
        expect(row.text).toContain(
            'All 12 ladders passed the eval in under 2% of trials',
        );
        expect(row.text).not.toContain('No ladder scored');
    });

    it('adds how many ladders were left out of the ranking when some were unscorable', () => {
        const row = ladderRowOf(
            scoredResult(AdviceSource.LadderSearchFresh, [WINNER], 3),
        );

        expect(row.status).toBe(OptimumRowStatus.Ready);
        expect(row.text).toContain(
            '3 of 12 ladders passed the eval in under 2% of trials',
        );
    });

    it('says nothing about unscorable ladders when every ladder scored', () => {
        const row = ladderRowOf(
            scoredResult(AdviceSource.LadderSearchFresh, [WINNER]),
        );

        expect(row.text).not.toContain('left out of every ranking');
    });
});

describe('the from-state ladder row says what its cost is (PT-108 step 2, F-120)', () => {
    const fromState = scoredResult(AdviceSource.LadderSearchFromState, [
        { ...WINNER, freshAttempt: FRESH_ATTEMPT },
    ]);

    it('labels the cost as the remaining cost to funded with sunk fees excluded', () => {
        const row = ladderRowOf(fromState, 5);

        expect(row.text).toContain(
            'remaining cost to funded, sunk fees excluded',
        );
        expect(row.text).not.toContain('cost per funded');
    });

    it('shows the fresh attempt figures from the winner beside it, with the fresh pass rate standard error', () => {
        const row = ladderRowOf(fromState, 5);

        expect(row.text).toContain(
            'A fresh attempt from scratch: pass rate 31.0%',
        );
        const fresh = row.figures.find(
            (figure) => figure.kind === OptimumFigureKind.FreshAttemptPassRate,
        );
        expect(fresh?.standardError).toBe(0.02);
        expect(fresh?.valueText).toBe('31.0%');
    });

    it('keeps the fresh-start wording off a fresh-start row', () => {
        const row = ladderRowOf(
            scoredResult(AdviceSource.LadderSearchFresh, [WINNER]),
        );

        expect(row.text).not.toContain('sunk fees');
        expect(row.text).not.toContain('A fresh attempt from scratch');
    });

    it('shows the observed-pass-chance caveat when every simulated attempt from this state passed (Q45 rule g)', () => {
        const row = ladderRowOf(
            scoredResult(AdviceSource.LadderSearchFromState, [
                {
                    ...WINNER,
                    freshAttempt: { ...FRESH_ATTEMPT, passRate: 0.01 },
                    passRate: 1,
                    passRateStandardError: 0,
                },
            ]),
            5,
        );

        expect(row.text).toContain(
            'Every simulated attempt from this state passed',
        );
    });

    it('shows no caveat below an observed pass chance of 1', () => {
        const row = ladderRowOf(fromState, 5);

        expect(row.text).not.toContain('Every simulated attempt');
    });
});

describe('the advice view model compares staleness through the enum (PT-104 addendum, F-118)', () => {
    const ADVICE_DIRECTORY = path.join(
        process.cwd(),
        'src',
        'app',
        '(app)',
        'prop-calculator',
        'accounts',
        '_components',
        'advice',
    );

    it.each(['adviceViewModel.ts', 'useAccountAdvice.ts'])(
        'leaves no stale or fresh literal comparison in %s',
        (file) => {
            const source = readFileSync(
                path.join(ADVICE_DIRECTORY, file),
                'utf8',
            );

            expect(source).not.toMatch(/[!=]==?\s*'(?:stale|fresh)'/);
        },
    );
});
