import { describeSimulationFailure } from '~/app/(app)/prop-calculator/_components/simulationFailure';
import { type FirmId, type Plan, type PlanOptIns } from '~/lib/prop-calculator';
import {
    AdviceSource,
    type EngineOptimumRequest,
    type EngineOptimumRunnerResult,
    enginePolicyKey,
    runEngineOptimum,
} from '~/lib/prop-calculator/advisor';
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

export interface AdvisorWorkerRequest {
    readonly firmId: FirmId;
    readonly optIns: PlanOptIns;
    readonly planSerial: string;
    readonly requests: readonly EngineOptimumRequest[];
}

export interface AdvisorWorkerResult {
    readonly outcomes: readonly AdvisorRequestOutcome[];
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

export function advisorWorkerCacheKey(request: AdvisorWorkerRequest): string {
    return stableJson({
        firmId: request.firmId,
        optIns: request.optIns,
        planSerial: request.planSerial,
        requests: request.requests.map(canonicalEngineOptimumRequest),
    });
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
