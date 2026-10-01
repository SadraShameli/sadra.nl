import { describeSimulationFailure } from '~/app/(app)/prop-calculator/_components/simulationFailure';
import {
    type FirmId,
    type Plan,
    type PlanOptIns,
    restoreFundedCycleTracker,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AdviceSource,
    type DocumentedPolicySpec,
    type EngineOptimumRequest,
    type EngineOptimumRunnerResult,
    enginePolicyKey,
    type ReconstructedFundedOrEvalAccount,
    runEngineOptimum,
} from '~/lib/prop-calculator/advisor';
import {
    payoutStakeComparison,
    type PayoutStakeComparisonOutcome,
    riskCandidateValues,
    type RiskCandidateValuesOutcome,
    tradeValueSwing,
    type TradeValueSwingOutcome,
    valueAtState,
    type ValueOutcome,
} from '~/lib/prop-calculator/advisor/value';
import { type SimStart } from '~/lib/prop-calculator/simulator';
import { stableJson } from '~/lib/stableJson';

export enum AdvisorRequestOutcomeKind {
    Failed = 'failed',
    Succeeded = 'succeeded',
}

export interface AdvisorRequestFailed {
    readonly kind: AdvisorRequestOutcomeKind.Failed;
    readonly reason: string;
    readonly source: EngineOptimumRequest['source'];
}

export type AdvisorRequestOutcome = AdvisorRequestFailed | AdvisorRequestSucceeded;

export interface AdvisorRequestSucceeded {
    readonly kind: AdvisorRequestOutcomeKind.Succeeded;
    readonly result: EngineOptimumRunnerResult;
}

export interface AdvisorValueRequest {
    readonly candidateRiskGrid: readonly number[];
    readonly payoutStake: null | { readonly reducedRiskDollars?: number };
    readonly rr: number;
    readonly rungs: readonly AdvisorValueRung[];
    readonly spec: DocumentedPolicySpec;
    readonly start: SimStart;
}

export interface AdvisorValueResult {
    readonly candidates: AdvisorValueSlot<RiskCandidateValuesOutcome>;
    readonly now: AdvisorValueSlot<ValueOutcome>;
    readonly payoutStake: AdvisorValueSlot<PayoutStakeComparisonOutcome> | null;
    readonly swings: readonly AdvisorValueSwing[];
}

export interface AdvisorValueRung {
    readonly risk: number;
    readonly rr: number;
}

export type AdvisorValueSlot<T> =
    | {
          readonly kind: AdvisorRequestOutcomeKind.Failed;
          readonly reason: string;
      }
    | { readonly kind: AdvisorRequestOutcomeKind.Succeeded; readonly value: T };

export interface AdvisorValueSwing {
    readonly outcome: AdvisorValueSlot<TradeValueSwingOutcome>;
    readonly rung: AdvisorValueRung;
}

export interface AdvisorWorkerRequest {
    readonly firmId: FirmId;
    readonly optIns: PlanOptIns;
    readonly planSerial: string;
    readonly requests: readonly EngineOptimumRequest[];
    readonly values?: AdvisorValueRequest;
}

export interface AdvisorWorkerResult {
    readonly outcomes: readonly AdvisorRequestOutcome[];
    readonly values?: AdvisorValueResult;
}

export function advisorRequestOutcomeOf(
    plan: Plan,
    request: EngineOptimumRequest,
): AdvisorRequestOutcome {
    try {
        return {
            kind: AdvisorRequestOutcomeKind.Succeeded,
            result: runEngineOptimum(plan, request),
        };
    } catch (error) {
        return {
            kind: AdvisorRequestOutcomeKind.Failed,
            reason: describeSimulationFailure(error),
            source: request.source,
        };
    }
}

export function advisorValueOutcomeOf(
    plan: Plan,
    request: AdvisorValueRequest,
): AdvisorValueResult {
    const { rr, spec } = request;
    const rebuilt = attempt(() => reconstructedAccountOf(plan, request.start));
    const slot = <T>(
        compute: (account: ReconstructedFundedOrEvalAccount) => T,
    ): AdvisorValueSlot<T> =>
        rebuilt.kind === AdvisorRequestOutcomeKind.Failed
            ? rebuilt
            : attempt(() => compute(rebuilt.value));
    return {
        candidates: slot((account) =>
            riskCandidateValues(account, spec, {
                riskGrid: request.candidateRiskGrid,
                rr,
            }),
        ),
        now: slot((account) => valueAtState(account, spec)),
        payoutStake:
            request.payoutStake === null
                ? null
                : slot((account) =>
                      payoutStakeComparison(account, spec, {
                          reducedRiskDollars: request.payoutStake?.reducedRiskDollars,
                      }),
                  ),
        swings: request.rungs.map((rung, position) => ({
            outcome: slot((account) =>
                tradeValueSwing(account, spec, {
                    ...rung,
                    earlierRisks: request.rungs
                        .slice(0, position)
                        .map((earlier) => earlier.risk),
                }),
            ),
            rung,
        })),
    };
}

export function advisorWorkerCacheKey(request: AdvisorWorkerRequest): string {
    return stableJson({
        firmId: request.firmId,
        optIns: request.optIns,
        planSerial: request.planSerial,
        requests: request.requests.map(canonicalEngineOptimumRequest),
        ...(request.values !== undefined && { values: canonicalValueRequest(request.values) }),
    });
}

export function reconstructedAccountOf(
    plan: Plan,
    start: SimStart,
): ReconstructedFundedOrEvalAccount {
    const { state } = start;
    const shared = {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        plan,
        resolvedDailyLossLimit: null,
        state,
    };
    switch (start.phase) {
        case TradingPhase.Eval: {
            return { ...shared, fundedTracker: null, kind: TradingPhase.Eval };
        }
        case TradingPhase.Funded: {
            return {
                ...shared,
                fundedTracker: restoreFundedCycleTracker(state, start.seed),
                kind: TradingPhase.Funded,
            };
        }
    }
}

function attempt<T>(compute: () => T): AdvisorValueSlot<T> {
    try {
        return { kind: AdvisorRequestOutcomeKind.Succeeded, value: compute() };
    } catch (error) {
        return {
            kind: AdvisorRequestOutcomeKind.Failed,
            reason: describeSimulationFailure(error),
        };
    }
}

function canonicalEngineOptimumRequest(request: EngineOptimumRequest): unknown {
    switch (request.source) {
        case AdviceSource.FundedSweepFresh:
        case AdviceSource.FundedSweepFromState:
        case AdviceSource.NextPayoutProjection: {
            return { ...request, policy: enginePolicyKey(request.policy) };
        }
        case AdviceSource.LadderSearchFresh:
        case AdviceSource.LadderSearchFromState: {
            return request;
        }
        case AdviceSource.PayoutSizeSweep: {
            return {
                ...request,
                spec: {
                    ...request.spec,
                    enginePolicy: enginePolicyKey(request.spec.enginePolicy),
                },
            };
        }
    }
}

function canonicalValueRequest(request: AdvisorValueRequest): unknown {
    return {
        ...request,
        spec: {
            ...request.spec,
            enginePolicy: enginePolicyKey(request.spec.enginePolicy),
        },
    };
}
