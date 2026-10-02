import { describe, expect, it } from 'vitest';

import {
    AdvisorRequestOutcomeKind,
    advisorRequestOutcomeOf,
    advisorWorkerCacheKey,
    type AdvisorWorkerRequest,
} from '~/app/(app)/prop-calculator/_workers/advisorWorkerMessages';
import {
    type AccountState,
    ApexVariant,
    findFirm,
    FirmId,
    type Plan,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AdviceSource,
    DEFAULT_RULEBOOK,
    EvalSizingAdvisor,
    LadderEngineOptimumResultKind,
    type LadderSearchRequest,
} from '~/lib/prop-calculator/advisor';

function apexEod50k(): Plan {
    const plan = findFirm(FirmId.Apex)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (plan === undefined) throw new Error('no Apex EOD 50K plan');
    return plan;
}

const PLAN = apexEod50k();

const STATE: AccountState = {
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

function ladderRequest(): LadderSearchRequest {
    const advisor = new EvalSizingAdvisor({
        account: {
            assumptions: [],
            contractLimit: null,
            cushion: STATE.balance - STATE.threshold,
            fundedTracker: null,
            kind: TradingPhase.Eval,
            plan: PLAN,
            resolvedDailyLossLimit: null,
            state: STATE,
        },
        maxEvalDays: 150,
        rulebook: DEFAULT_RULEBOOK,
        sims: 200,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
    });
    const [request] = advisor.optimumRequests();
    if (request?.source !== AdviceSource.LadderSearchFresh) {
        throw new Error('expected a fresh ladder search request');
    }
    return request;
}

function workerRequest(request: LadderSearchRequest): AdvisorWorkerRequest {
    return {
        firmId: FirmId.Apex,
        optIns: { takesFundedReset: false, takesOneTimeEarlyWithdrawal: false },
        planSerial: 'apex-50000-eod',
        requests: [request],
    };
}

describe('the advisor worker scores the documented ladder (PT-19h, F-119)', () => {
    it('returns the documented score with the ladder search, computed in the worker call', () => {
        const request = ladderRequest();

        const outcome = advisorRequestOutcomeOf(PLAN, request);

        expect(outcome.kind).toBe(AdvisorRequestOutcomeKind.Succeeded);
        if (outcome.kind !== AdvisorRequestOutcomeKind.Succeeded) return;
        const { result } = outcome;
        if (
            result.source !== AdviceSource.LadderSearchFresh ||
            result.kind !== LadderEngineOptimumResultKind.Scored
        ) {
            throw new Error('expected a scored ladder result');
        }
        expect(result.documentedScore?.ladder).toEqual(
            request.documentedLadder,
        );
    });

    it('keys the cache on the documented ladder, so a changed documented ladder is recomputed', () => {
        const request = ladderRequest();
        const changed: LadderSearchRequest = {
            ...request,
            documentedLadder: [...(request.documentedLadder ?? []), 25],
        };

        expect(advisorWorkerCacheKey(workerRequest(changed))).not.toBe(
            advisorWorkerCacheKey(workerRequest(request)),
        );
    });
});
