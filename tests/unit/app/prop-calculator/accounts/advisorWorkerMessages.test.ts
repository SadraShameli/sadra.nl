import { describe, expect, it } from 'vitest';

import {
    AdvisorRequestOutcomeKind,
    advisorRequestOutcomeOf,
    advisorValueOutcomeOf,
    type AdvisorValueRequest,
    advisorWorkerCacheKey,
    type AdvisorWorkerRequest,
    reconstructedAccountOf,
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
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    type DocumentedPolicySpec,
    type EngineOptimumRequest,
    EvalSizingAdvisor,
    FundedSizingAdvisor,
    type ReconstructedFundedOrEvalAccount,
} from '~/lib/prop-calculator/advisor';
import {
    payoutStakeComparison,
    riskCandidateValues,
    startStateOf,
    tradeValueSwing,
    valueAtState,
} from '~/lib/prop-calculator/advisor/value';
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

function evalAccount(
    overrides: Partial<ReconstructedFundedOrEvalAccount> = {},
): ReconstructedFundedOrEvalAccount {
    const state = accountState({
        balance: 50_600,
        elapsedDays: 7,
        qualifyingDays: 5,
        tradingDays: 5,
    });
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: null,
        kind: TradingPhase.Eval,
        plan,
        resolvedDailyLossLimit: null,
        state,
        ...overrides,
    };
}

function valueRequestOf(
    account: ReconstructedFundedOrEvalAccount,
    overrides: Partial<AdvisorValueRequest> = {},
): AdvisorValueRequest {
    return {
        candidateRiskGrid: [250, 500],
        payoutStake: null,
        rr: 2,
        rungs: [
            { risk: 500, rr: 2 },
            { risk: 750, rr: 2 },
        ],
        spec: valueSpec(),
        start: startStateOf(plan, account),
        ...overrides,
    };
}

function valueSpec(): DocumentedPolicySpec {
    return {
        enginePolicy: buildEnginePolicy({
            fundedHorizonDays: 60,
            plan,
            rulebook: DEFAULT_RULEBOOK,
        }).policy,
        rulebook: DEFAULT_RULEBOOK,
        run: { maxEvalDays: 40, seed: 11, trials: 30 },
    };
}

describe('advisor value requests (PT-67)', () => {
    it('rebuilds an eval account from its start so it values exactly like the original', () => {
        const original = evalAccount();
        const request = valueRequestOf(original);

        const rebuilt = reconstructedAccountOf(plan, request.start);

        expect(rebuilt.kind).toBe(TradingPhase.Eval);
        expect(rebuilt.state).toEqual(original.state);
        expect(valueAtState(rebuilt, request.spec)).toEqual(
            valueAtState(original, request.spec),
        );
    });

    it('rebuilds a funded account with its cycle tracker from the seed so it values exactly like the original', () => {
        const original = fundedAccount();
        const request = valueRequestOf(original);

        const rebuilt = reconstructedAccountOf(plan, request.start);

        expect(rebuilt.kind).toBe(TradingPhase.Funded);
        expect(rebuilt.fundedTracker?.payoutsIssued).toBe(
            original.fundedTracker?.payoutsIssued,
        );
        expect(valueAtState(rebuilt, request.spec)).toEqual(
            valueAtState(original, request.spec),
        );
    });

    it('round-trips a value request through structuredClone', () => {
        const request = valueRequestOf(fundedAccount(), {
            payoutStake: { reducedRiskDollars: 125 },
        });

        expect(structuredClone(request)).toEqual(request);
    });

    it('keeps the cache key of a request without values unchanged and changes it when values are added', () => {
        const advisor = fundedAdvisor();
        const base = workerRequestOf(advisor.optimumRequests());

        const withValues: AdvisorWorkerRequest = {
            ...base,
            values: valueRequestOf(fundedAccount()),
        };

        expect(advisorWorkerCacheKey({ ...base, values: undefined })).toBe(
            advisorWorkerCacheKey(base),
        );
        expect(advisorWorkerCacheKey(withValues)).not.toBe(
            advisorWorkerCacheKey(base),
        );
    });

    it('gives the same cache key for identical value requests and a different one when the account state differs', () => {
        const base = workerRequestOf([]);
        const a = valueRequestOf(fundedAccount());
        const b = valueRequestOf(fundedAccount());
        const moved = valueRequestOf(
            fundedAccount({ state: accountState({ balance: 52_000 }) }),
        );

        expect(advisorWorkerCacheKey({ ...base, values: a })).toBe(
            advisorWorkerCacheKey({ ...base, values: b }),
        );
        expect(advisorWorkerCacheKey({ ...base, values: a })).not.toBe(
            advisorWorkerCacheKey({ ...base, values: moved }),
        );
    });

    it('computes the value now, a swing per rung and the ranked candidates exactly as the library does', () => {
        const account = fundedAccount();
        const request = valueRequestOf(account);

        const result = advisorValueOutcomeOf(plan, request);

        const [firstRung, secondRung] = request.rungs;
        expect(result.swings).toHaveLength(2);
        expect(result.swings[0]?.rung).toEqual(firstRung);
        expect(result.swings[0]?.outcome).toEqual({
            kind: AdvisorRequestOutcomeKind.Succeeded,
            value: tradeValueSwing(account, request.spec, firstRung ?? { risk: 0, rr: 0 }),
        });
        expect(result.swings[1]?.outcome).toEqual({
            kind: AdvisorRequestOutcomeKind.Succeeded,
            value: tradeValueSwing(account, request.spec, secondRung ?? { risk: 0, rr: 0 }),
        });
        expect(result.now).toEqual({
            kind: AdvisorRequestOutcomeKind.Succeeded,
            value: valueAtState(account, request.spec),
        });
        expect(result.candidates).toEqual({
            kind: AdvisorRequestOutcomeKind.Succeeded,
            value: riskCandidateValues(account, request.spec, {
                riskGrid: request.candidateRiskGrid,
                rr: request.rr,
            }),
        });
        expect(result.payoutStake).toBeNull();
    });

    it('computes the payout stake comparison only when it is requested', () => {
        const account = fundedAccount();
        const request = valueRequestOf(account, {
            payoutStake: { reducedRiskDollars: 125 },
        });

        const result = advisorValueOutcomeOf(plan, request);

        expect(result.payoutStake).toEqual({
            kind: AdvisorRequestOutcomeKind.Succeeded,
            value: payoutStakeComparison(account, request.spec, {
                reducedRiskDollars: 125,
            }),
        });
    });

    it('turns a failing computation into a typed Failed slot and keeps the others', () => {
        const account = fundedAccount();
        const request = valueRequestOf(account, {
            payoutStake: { reducedRiskDollars: -1 },
        });

        const result = advisorValueOutcomeOf(plan, request);

        expect(result.payoutStake?.kind).toBe(AdvisorRequestOutcomeKind.Failed);
        if (result.payoutStake?.kind !== AdvisorRequestOutcomeKind.Failed) return;
        expect(result.payoutStake.reason.length).toBeGreaterThan(0);
        expect(result.now.kind).toBe(AdvisorRequestOutcomeKind.Succeeded);
        expect(result.swings.every((swing) => swing.outcome.kind === AdvisorRequestOutcomeKind.Succeeded)).toBe(true);
    });

    it('fails every slot with a stated reason, not a throw, when the spec is invalid', () => {
        const account = evalAccount();
        const valid = valueRequestOf(account);
        const request: AdvisorValueRequest = {
            ...valid,
            spec: { ...valid.spec, run: { ...valid.spec.run, trials: 0 } },
        };

        const result = advisorValueOutcomeOf(plan, request);

        expect(result.now.kind).toBe(AdvisorRequestOutcomeKind.Failed);
        expect(result.candidates.kind).toBe(AdvisorRequestOutcomeKind.Failed);
        expect(result.swings.every((swing) => swing.outcome.kind === AdvisorRequestOutcomeKind.Failed)).toBe(true);
    });
});
