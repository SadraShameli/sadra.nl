'use client';

import { useMemo } from 'react';

import { ComputationId } from '~/app/(app)/prop-calculator/_components/ComputationId';
import { useCachedWorkerTask } from '~/app/(app)/prop-calculator/_components/useCachedWorkerTask';
import { WorkerTaskPhase } from '~/app/(app)/prop-calculator/_components/workerTaskState';
import {
    type AdvisorRequestFailed,
    AdvisorRequestOutcomeKind,
    advisorWorkerCacheKey,
    type AdvisorWorkerRequest,
    type AdvisorWorkerResult,
} from '~/app/(app)/prop-calculator/_workers/advisorWorkerMessages';
import { type FirmId, type PlanOptIns } from '~/lib/prop-calculator';
import { type Advice, type EngineOptimumRunnerResult, type SizingAdvisor } from '~/lib/prop-calculator/advisor';

export enum AccountAdvicePhase {
    Failed = 'failed',
    Loading = 'loading',
    Ready = 'ready',
}

export type AccountAdviceState =
    | {
          readonly advice: Advice;
          readonly failedOptima: readonly AdvisorRequestFailed[];
          readonly phase: AccountAdvicePhase.Ready;
      }
    | {
          readonly phase: AccountAdvicePhase.Failed;
          readonly reason: string;
          readonly retry: () => void;
      }
    | { readonly phase: AccountAdvicePhase.Loading };

export interface UseAccountAdviceInput {
    readonly advisor: SizingAdvisor;
    readonly firmId: FirmId;
    readonly optIns: PlanOptIns;
    readonly planSerial: string;
}

const LOADING: AccountAdviceState = { phase: AccountAdvicePhase.Loading };

export function useAccountAdvice(
    input: null | UseAccountAdviceInput,
): AccountAdviceState {
    const advisor = input?.advisor;
    const firmId = input?.firmId;
    const optIns = input?.optIns;
    const planSerial = input?.planSerial;
    const requests = useMemo(() => advisor?.optimumRequests(), [advisor]);
    const job = useMemo(() => {
        if (
            firmId === undefined ||
            optIns === undefined ||
            planSerial === undefined ||
            requests === undefined ||
            requests.length === 0
        ) {
            return null;
        }
        const request: AdvisorWorkerRequest = {
            firmId,
            optIns,
            planSerial,
            requests,
        };
        return { key: advisorWorkerCacheKey(request), request };
    }, [firmId, optIns, planSerial, requests]);
    const task = useCachedWorkerTask<
        ComputationId.Advice,
        AdvisorWorkerRequest
    >({
        createWorker: createAdvisorWorker,
        id: ComputationId.Advice,
        job,
    });
    const outcome =
        task.state.phase === WorkerTaskPhase.Done ? task.state.result : null;
    const hasNoRequests = requests !== undefined && requests.length === 0;
    const ready = useMemo(() => {
        if (advisor === undefined) return null;
        if (hasNoRequests) {
            return { advice: advisor.assemble([]), failedOptima: [] };
        }
        if (outcome === null) return null;
        return {
            advice: advisor.assemble(engineOptimumResultsOf(outcome)),
            failedOptima: failedOptimaOf(outcome),
        };
    }, [advisor, hasNoRequests, outcome]);

    if (ready !== null) {
        return { ...ready, phase: AccountAdvicePhase.Ready };
    }
    if (task.state.phase === WorkerTaskPhase.Failed) {
        return {
            phase: AccountAdvicePhase.Failed,
            reason: task.state.reason,
            retry: task.retry,
        };
    }
    return LOADING;
}

function createAdvisorWorker(): Worker {
    return new Worker(
        new URL('../../../_workers/advisorWorker.ts', import.meta.url),
        { type: 'module' },
    );
}

function engineOptimumResultsOf(
    result: AdvisorWorkerResult,
): readonly EngineOptimumRunnerResult[] {
    return result.outcomes.flatMap((outcome) =>
        outcome.kind === AdvisorRequestOutcomeKind.Succeeded
            ? [outcome.result]
            : [],
    );
}

function failedOptimaOf(
    result: AdvisorWorkerResult,
): readonly AdvisorRequestFailed[] {
    return result.outcomes.flatMap((outcome) =>
        outcome.kind === AdvisorRequestOutcomeKind.Failed ? [outcome] : [],
    );
}
