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
    type EvalSizingAdvisorInput,
    FundedSizingAdvisor,
    NO_PENDING_PAYOUT_COUNTS,
    type ReconstructedFundedOrEvalAccount,
} from '~/lib/prop-calculator/advisor';
import {
    payoutStakeComparison,
    riskCandidateValues,
    startStateOf,
    tradeValueSwing,
    valueAtState,
    ValueResultKind,
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
        ...NO_PENDING_PAYOUT_COUNTS,
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
        substate: null,
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
                ...NO_PENDING_PAYOUT_COUNTS,
            },
            maxEvalDays: 150,
            rulebook: DEFAULT_RULEBOOK,
            sims: 20,
            snapshotAsOf: '2026-09-26',
            substate: null,
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

function evalAccount(): ReconstructedFundedOrEvalAccount {
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
        ...NO_PENDING_PAYOUT_COUNTS,
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
        run: { maxEvalDays: 40, seed: 11, trials: 12 },
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

    it('changes the cache key when the rulebook live-transfer hazard changes, so a stale value is never reused (PT-73b)', () => {
        const base = workerRequestOf([]);
        const values = valueRequestOf(fundedAccount());
        const withHazard = (hazard: number): AdvisorValueRequest => ({
            ...values,
            spec: {
                ...values.spec,
                rulebook: {
                    ...values.spec.rulebook,
                    liveTransfer: {
                        hazardPerPaidPayoutByFirm: { [FirmId.TopStep]: hazard },
                    },
                },
            },
        });

        const none = advisorWorkerCacheKey({ ...base, values });
        const thirty = advisorWorkerCacheKey({
            ...base,
            values: withHazard(0.3),
        });
        const forty = advisorWorkerCacheKey({
            ...base,
            values: withHazard(0.4),
        });

        expect(thirty).not.toBe(none);
        expect(forty).not.toBe(thirty);
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
            value: tradeValueSwing(
                account,
                request.spec,
                firstRung ?? { risk: 0, rr: 0 },
            ),
        });
        expect(result.swings[1]?.outcome).toEqual({
            kind: AdvisorRequestOutcomeKind.Succeeded,
            value: tradeValueSwing(account, request.spec, {
                ...(secondRung ?? { risk: 0, rr: 0 }),
                earlierRisks: [firstRung?.risk ?? 0],
            }),
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

    it('carries the live-transfer assumption and the share sent live on every value run when the rulebook prices a hazard (PT-73d)', () => {
        const account = fundedAccount();
        const base = valueRequestOf(account);
        const priced: AdvisorValueRequest = {
            ...base,
            spec: {
                ...base.spec,
                rulebook: {
                    ...base.spec.rulebook,
                    liveTransfer: {
                        hazardPerPaidPayoutByFirm: { [FirmId.TopStep]: 0.3 },
                    },
                },
            },
        };

        const result = advisorValueOutcomeOf(plan, priced);
        const none = advisorValueOutcomeOf(plan, base);

        if (
            result.now.kind !== AdvisorRequestOutcomeKind.Succeeded ||
            none.now.kind !== AdvisorRequestOutcomeKind.Succeeded ||
            result.now.value.kind !== ValueResultKind.Value ||
            none.now.value.kind !== ValueResultKind.Value
        ) {
            throw new Error('expected value runs');
        }
        expect(result.now.value.liveTransfer).toMatchObject({ hazard: 0.3 });
        expect(
            result.now.value.liveTransfer?.sentLiveShare,
        ).toBeGreaterThanOrEqual(0);
        expect(result.now.value.liveTransfer?.sentLiveShare).not.toBeNull();
        expect('liveTransfer' in none.now.value).toBe(false);
        expect(
            advisorWorkerCacheKey({
                firmId: FirmId.TopStep,
                optIns: NO_PLAN_OPT_INS,
                planSerial: serializePlanId(plan.id),
                requests: [],
                values: priced,
            }),
        ).not.toBe(
            advisorWorkerCacheKey({
                firmId: FirmId.TopStep,
                optIns: NO_PLAN_OPT_INS,
                planSerial: serializePlanId(plan.id),
                requests: [],
                values: base,
            }),
        );
        if (
            result.candidates.kind !== AdvisorRequestOutcomeKind.Succeeded ||
            result.candidates.value.kind !== ValueResultKind.Candidates
        ) {
            throw new Error('expected candidates');
        }
        expect(result.candidates.value.liveTransfer).toMatchObject({
            hazard: 0.3,
        });
    });

    it('prices a later rung from the account after the earlier rungs lost, never from the session start', () => {
        const account = evalAccount();
        const request = valueRequestOf(account);

        const result = advisorValueOutcomeOf(plan, request);

        const [first, second] = result.swings;
        if (
            first?.outcome.kind !== AdvisorRequestOutcomeKind.Succeeded ||
            second?.outcome.kind !== AdvisorRequestOutcomeKind.Succeeded ||
            first.outcome.value.kind !== ValueResultKind.Swing ||
            second.outcome.value.kind !== ValueResultKind.Swing
        ) {
            throw new Error('expected two swing results');
        }
        expect(second.outcome.value.now).not.toEqual(first.outcome.value.now);
        expect(second.outcome.value).not.toEqual(
            tradeValueSwing(account, request.spec, second.rung),
        );
    });

    it('values every swing and the candidates of an eval account through the worker, valued at the next session start', () => {
        const account = evalAccount();
        const request = valueRequestOf(account);

        const result = advisorValueOutcomeOf(plan, request);

        expect(result.swings).toHaveLength(2);
        for (const [position, swing] of result.swings.entries()) {
            expect(swing.outcome.kind).toBe(
                AdvisorRequestOutcomeKind.Succeeded,
            );
            if (swing.outcome.kind !== AdvisorRequestOutcomeKind.Succeeded)
                return;
            expect(swing.outcome.value).toEqual(
                tradeValueSwing(account, request.spec, {
                    ...swing.rung,
                    earlierRisks: request.rungs
                        .slice(0, position)
                        .map((earlier) => earlier.risk),
                }),
            );
            expect(swing.outcome.value.kind).toBe(ValueResultKind.Swing);
        }
        expect(result.candidates.kind).toBe(
            AdvisorRequestOutcomeKind.Succeeded,
        );
        if (result.candidates.kind !== AdvisorRequestOutcomeKind.Succeeded)
            return;
        expect(result.candidates.value.kind).toBe(ValueResultKind.Candidates);
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
        if (result.payoutStake?.kind !== AdvisorRequestOutcomeKind.Failed)
            return;
        expect(result.payoutStake.reason.length).toBeGreaterThan(0);
        expect(result.now.kind).toBe(AdvisorRequestOutcomeKind.Succeeded);
        expect(
            result.swings.every(
                (swing) =>
                    swing.outcome.kind === AdvisorRequestOutcomeKind.Succeeded,
            ),
        ).toBe(true);
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
        expect(
            result.swings.every(
                (swing) =>
                    swing.outcome.kind === AdvisorRequestOutcomeKind.Failed,
            ),
        ).toBe(true);
    });
});

function ladderKey(overrides: Partial<EvalSizingAdvisorInput> = {}) {
    const advisor = new EvalSizingAdvisor({
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
            ...NO_PENDING_PAYOUT_COUNTS,
        },
        maxEvalDays: 150,
        rulebook: DEFAULT_RULEBOOK,
        sims: 20,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
        ...overrides,
    });
    const [request] = advisor.optimumRequests();
    if (request?.source !== AdviceSource.LadderSearchFresh) {
        throw new Error('expected a LadderSearchFresh request');
    }
    return advisorWorkerCacheKey(workerRequestOf([request]));
}

describe('advisorWorkerCacheKey keys a ladder on its engine policy (PT-104, F-118)', () => {
    it('gives the same key for the same rulebook and rebuy lag', () => {
        expect(ladderKey()).toBe(ladderKey());
    });

    it('changes the key when the measured rebuy lag changes', () => {
        expect(
            ladderKey({ measuredRebuyLag: { days: 3, samples: 5 } }),
        ).not.toBe(ladderKey());
    });

    it('changes the key when the rulebook retained cushion changes', () => {
        expect(
            ladderKey({
                rulebook: {
                    ...DEFAULT_RULEBOOK,
                    payout: {
                        ...DEFAULT_RULEBOOK.payout,
                        retainedCushionCents: 400_000,
                    },
                },
            }),
        ).not.toBe(ladderKey());
    });
});
