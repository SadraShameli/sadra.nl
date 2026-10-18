import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    ApexVariant,
    dollars,
    findFirm,
    FirmId,
    type Plan,
    type PlanId,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AdviceSource,
    DEFAULT_RULEBOOK,
    EvalSizingAdvisor,
    LadderEngineOptimumResultKind,
    NO_PENDING_PAYOUT_COUNTS,
    NO_PERSONAL_CAPS,
    type ReconstructedFundedOrEvalAccount,
    runEngineOptimum,
    StartBasis,
} from '~/lib/prop-calculator/advisor';
import { runLadderSearch } from '~/lib/prop-calculator/core';

const APEX_EOD_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
};

const plan: Plan = (() => {
    const found = findFirm(APEX_EOD_ID.firm)?.findPlan(APEX_EOD_ID);
    if (!found) throw new Error(`${serializePlanId(APEX_EOD_ID)} missing`);
    return found;
})();

function accountAt(at: AccountState): ReconstructedFundedOrEvalAccount {
    return {
        assumptions: [],
        contractLimit: null,
        cushion: at.balance - at.threshold,
        fundedTracker: null,
        kind: TradingPhase.Eval,
        plan,
        resolvedDailyLossLimit: null,
        state: at,
        ...NO_PENDING_PAYOUT_COUNTS,
    };
}

function advisorAt(at: AccountState): EvalSizingAdvisor {
    return new EvalSizingAdvisor({
        account: accountAt(at),
        maxEvalDays: 40,
        personalCaps: {
            ...NO_PERSONAL_CAPS,
            maxRiskPerTrade: dollars(300),
            maxTradesPerDay: 2,
        },
        rulebook: DEFAULT_RULEBOOK,
        seed: 7,
        sims: 200,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
    });
}

function ladderRequestOf(advisor: EvalSizingAdvisor) {
    const [request] = advisor.optimumRequests();
    if (
        request?.source !== AdviceSource.LadderSearchFresh &&
        request?.source !== AdviceSource.LadderSearchFromState
    ) {
        throw new Error('expected a ladder request');
    }
    return request;
}

function state(overrides: Partial<AccountState> = {}): AccountState {
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

function topOf(result: ReturnType<typeof runEngineOptimum>) {
    if (
        !('kind' in result) ||
        result.kind !== LadderEngineOptimumResultKind.Scored
    ) {
        throw new Error('expected a scored ladder result');
    }
    const [top] = result.ladder.bySpeed;
    if (top === undefined) throw new Error('expected a ranked ladder');
    return top;
}

describe('the eval advisor, the runner and the core search agree on a mid-eval state (PT-104, F-120)', () => {
    const midEval = state({
        balance: 51_300,
        elapsedDays: 4,
        threshold: 49_900,
        tradingDays: 4,
    });

    it('requests a from-state ladder carrying the reconstructed state and elapsed days', () => {
        const request = ladderRequestOf(advisorAt(midEval));

        expect(request.source).toBe(AdviceSource.LadderSearchFromState);
        expect(request.score.startState).toStrictEqual(midEval);
        expect(request.score.subscriptionElapsedDays).toBe(4);
        expect(advisorAt(midEval).assemble([]).provenance.startBasis).toBe(
            StartBasis.FromState,
        );
    });

    it('scores the same ladders through the runner as the core search does for that request', () => {
        const request = ladderRequestOf(advisorAt(midEval));

        const viaRunner = runEngineOptimum(plan, request);
        const viaCore = runLadderSearch({
            grid: request.grid,
            maxGridSize: request.maxGridSize,
            score: { ...request.score, plan },
            seed: request.seed,
            topN: request.topN,
        });

        expect(topOf(viaRunner)).toStrictEqual(viaCore.bySpeed[0]);
    });

    it('gives a from-state result that differs from the fresh-start result of the same plan', () => {
        const fromState = ladderRequestOf(advisorAt(midEval));
        const fresh = ladderRequestOf(
            advisorAt(state({ balance: 52_000, threshold: 50_000 })),
        );

        expect(fresh.source).toBe(AdviceSource.LadderSearchFresh);
        const fromStateTop = topOf(runEngineOptimum(plan, fromState));
        const freshTop = topOf(runEngineOptimum(plan, fresh));

        expect(fromStateTop).not.toStrictEqual(freshTop);
        expect(fromStateTop.passRate).not.toBe(freshTop.passRate);
    });
});
