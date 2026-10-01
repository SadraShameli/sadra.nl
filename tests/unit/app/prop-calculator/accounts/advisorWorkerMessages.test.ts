import { describe, expect, it } from 'vitest';

import {
    AdvisorRequestOutcomeKind,
    advisorRequestOutcomeOf,
    advisorWorkerCacheKey,
    type AdvisorWorkerRequest,
} from '~/app/(app)/prop-calculator/_workers/advisorWorkerMessages';
import {
    type AccountState,
    findFirm,
    FirmId,
    type FundedCycleTracker,
    newFundedCycleTracker,
    NO_PLAN_OPT_INS,
    type Plan,
    type PlanId,
    serializePlanId,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AdviceSource,
    DEFAULT_RULEBOOK,
    type EngineOptimumRequest,
    EvalSizingAdvisor,
    FundedSizingAdvisor,
    type ReconstructedFundedOrEvalAccount,
} from '~/lib/prop-calculator/advisor';
import { InstrumentSymbol } from '~/lib/prop-calculator/core';
import { SIM_INPUTS_REFUSAL_PREFIX } from '~/lib/prop-calculator/simulator';

const TOPSTEP_STANDARD_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
};

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

const plan = registryPlan(TOPSTEP_STANDARD_ID);

function accountState(overrides: Partial<AccountState> = {}): AccountState {
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
        ...overrides,
    };
}

function fundedAccount(
    overrides: Partial<ReconstructedFundedOrEvalAccount> = {},
): ReconstructedFundedOrEvalAccount {
    const state = accountState();
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: tracker(state),
        kind: TradingPhase.Funded,
        plan,
        resolvedDailyLossLimit: null,
        state,
        ...overrides,
    };
}

function fundedAdvisor(
    overrides: Partial<ReconstructedFundedOrEvalAccount> = {},
): FundedSizingAdvisor {
    return new FundedSizingAdvisor({
        account: fundedAccount(overrides),
        fundedHorizonDays: 252,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        today: '2026-09-26',
        trials: 20,
    });
}

function tracker(state: AccountState): FundedCycleTracker {
    return newFundedCycleTracker({ ...state, balance: state.startingBalance });
}

function workerRequestOf(
    requests: readonly EngineOptimumRequest[],
): AdvisorWorkerRequest {
    return {
        firmId: FirmId.TopStep,
        optIns: NO_PLAN_OPT_INS,
        planSerial: serializePlanId(plan.id),
        requests,
    };
}

describe('advisorWorkerMessages (PT-34)', () => {
    it('builds a cache key for every member of the EngineOptimumRequest union without throwing', () => {
        const advisor = fundedAdvisor();
        const requests = advisor.optimumRequests();
        const sources = requests.map((request) => request.source);

        expect(sources).toContain(AdviceSource.FundedSweepFresh);
        expect(sources).toContain(AdviceSource.FundedSweepFromState);
        expect(sources).toContain(AdviceSource.PayoutSizeSweep);

        for (const request of requests) {
            expect(() =>
                advisorWorkerCacheKey(workerRequestOf([request])),
            ).not.toThrow();
        }

        const evalAdvisor = new EvalSizingAdvisor({
            account: {
                assumptions: [],
                contractLimit: null,
                cushion: 2000,
                fundedTracker: null,
                kind: TradingPhase.Eval,
                plan,
                resolvedDailyLossLimit: null,
                state: accountState({
                    startingBalance: 50_000,
                    threshold: 48_000,
                    tradingDays: 0,
                }),
            },
            maxEvalDays: 150,
            rulebook: DEFAULT_RULEBOOK,
            sims: 20,
            snapshotAsOf: '2026-09-26',
            today: '2026-09-26',
        });
        const [ladderRequest] = evalAdvisor.optimumRequests();
        if (ladderRequest?.source !== AdviceSource.LadderSearchFresh) {
            throw new Error('expected a LadderSearchFresh request');
        }
        expect(() =>
            advisorWorkerCacheKey(workerRequestOf([ladderRequest])),
        ).not.toThrow();
    });

    it('round-trips every request through structuredClone (no closures or class instances)', () => {
        const advisor = fundedAdvisor();
        const request = workerRequestOf(advisor.optimumRequests());

        const cloned = structuredClone(request);

        expect(cloned).toEqual(request);
    });

    it('gives the same cache key for structurally identical requests and a different key when the policy differs', () => {
        const advisor = fundedAdvisor();
        const [freshA] = advisor.optimumRequests();
        if (freshA?.source !== AdviceSource.FundedSweepFresh) {
            throw new Error('expected a FundedSweepFresh request');
        }
        const freshB: EngineOptimumRequest = {
            ...freshA,
            policy: { ...freshA.policy },
        };
        expect(advisorWorkerCacheKey(workerRequestOf([freshA]))).toBe(
            advisorWorkerCacheKey(workerRequestOf([freshB])),
        );

        const changedPolicy: EngineOptimumRequest = {
            ...freshA,
            policy: {
                ...freshA.policy,
                fundedHorizonDays: freshA.policy.fundedHorizonDays + 1,
            },
        };
        expect(advisorWorkerCacheKey(workerRequestOf([freshA]))).not.toBe(
            advisorWorkerCacheKey(workerRequestOf([changedPolicy])),
        );
    });

    it('dedupes fresh-start requests across two accounts with different states on the same plan and policy', () => {
        const [freshRequestA] = fundedAdvisor().optimumRequests();
        const [freshRequestB] = fundedAdvisor({
            state: accountState({ balance: 60_000 }),
        }).optimumRequests();
        if (
            freshRequestA?.source !== AdviceSource.FundedSweepFresh ||
            freshRequestB?.source !== AdviceSource.FundedSweepFresh
        ) {
            throw new Error('expected FundedSweepFresh requests');
        }

        expect(advisorWorkerCacheKey(workerRequestOf([freshRequestA]))).toBe(
            advisorWorkerCacheKey(workerRequestOf([freshRequestB])),
        );
    });

    it('turns a refusal (SIM_INPUTS_REFUSAL_PREFIX) into a typed Failed outcome, not a thrown error', () => {
        const advisor = fundedAdvisor();
        const [freshRequest] = advisor.optimumRequests();
        if (freshRequest?.source !== AdviceSource.FundedSweepFresh) {
            throw new Error('expected a FundedSweepFresh request');
        }
        const noCandidatesRequest: EngineOptimumRequest = {
            ...freshRequest,
            candidates: {
                ...freshRequest.candidates,
                flat: [],
                fundedLadder: null,
            },
        };

        const outcome = advisorRequestOutcomeOf(plan, noCandidatesRequest);

        expect(outcome.kind).toBe(AdvisorRequestOutcomeKind.Succeeded);

        const refusingRequest: EngineOptimumRequest = {
            ...freshRequest,
            base: {
                ...freshRequest.base,
                instrument: InstrumentSymbol.ES,
                stopPoints: 500,
            },
        };

        const failed = advisorRequestOutcomeOf(plan, refusingRequest);

        expect(failed.kind).toBe(AdvisorRequestOutcomeKind.Failed);
        if (failed.kind !== AdvisorRequestOutcomeKind.Failed) return;
        expect(failed.reason.length).toBeGreaterThan(0);
        expect(failed.reason.startsWith(SIM_INPUTS_REFUSAL_PREFIX)).toBe(false);
        expect(failed.source).toBe(AdviceSource.FundedSweepFresh);
    });
});
