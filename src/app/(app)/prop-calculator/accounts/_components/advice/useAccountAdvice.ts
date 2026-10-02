'use client';

import { useMemo } from 'react';

import { ComputationId } from '~/app/(app)/prop-calculator/_components/ComputationId';
import {
    type CachedWorkerTask,
    useCachedWorkerTask,
} from '~/app/(app)/prop-calculator/_components/useCachedWorkerTask';
import { WorkerTaskPhase } from '~/app/(app)/prop-calculator/_components/workerTaskState';
import {
    type AdvisorRequestFailed,
    AdvisorRequestOutcomeKind,
    type AdvisorValueRequest,
    type AdvisorValueResult,
    advisorWorkerCacheKey,
    type AdvisorWorkerRequest,
    type AdvisorWorkerResult,
} from '~/app/(app)/prop-calculator/_workers/advisorWorkerMessages';
import { type FirmId, type PlanOptIns } from '~/lib/prop-calculator';
import {
    type Advice,
    type EngineOptimumRunnerResult,
    type SizingAdvisor,
} from '~/lib/prop-calculator/advisor';

export enum AccountAdvicePhase {
    Failed = 'failed',
    Loading = 'loading',
    Ready = 'ready',
}

export enum AdviceValuesPhase {
    Failed = 'failed',
    Idle = 'idle',
    Loading = 'loading',
    Ready = 'ready',
    Unavailable = 'unavailable',
}

export type AccountAdviceState =
    | {
          readonly advice: Advice;
          readonly failedOptima: readonly AdvisorRequestFailed[];
          readonly phase: AccountAdvicePhase.Ready;
          readonly values: AdviceValuesState;
      }
    | {
          readonly phase: AccountAdvicePhase.Failed;
          readonly reason: string;
          readonly retry: () => void;
      }
    | { readonly phase: AccountAdvicePhase.Loading };

export type AdviceValuesState =
    | {
          readonly phase: AdviceValuesPhase.Failed;
          readonly reason: string;
          readonly retry: () => void;
      }
    | { readonly phase: AdviceValuesPhase.Idle }
    | { readonly phase: AdviceValuesPhase.Loading }
    | {
          readonly phase: AdviceValuesPhase.Ready;
          readonly result: AdvisorValueResult;
      }
    | {
          readonly phase: AdviceValuesPhase.Unavailable;
          readonly reason: string;
      };

export interface UseAccountAdviceInput {
    readonly advisor: SizingAdvisor;
    readonly firmId: FirmId;
    readonly optIns: PlanOptIns;
    readonly planSerial: string;
    readonly values?: AdvisorValueRequest | null;
    readonly valuesUnavailableReason?: null | string;
}

const IDLE_VALUES: AdviceValuesState = { phase: AdviceValuesPhase.Idle };

const LOADING: AccountAdviceState = { phase: AccountAdvicePhase.Loading };

const LOADING_VALUES: AdviceValuesState = { phase: AdviceValuesPhase.Loading };

const NO_VALUE_OUTCOME_REASON =
    'The advisor worker returned no value outcome for this account.';

export function useAccountAdvice(
    input: null | UseAccountAdviceInput,
): AccountAdviceState {
    const advisor = input?.advisor;
    const firmId = input?.firmId;
    const optIns = input?.optIns;
    const planSerial = input?.planSerial;
    const values = advisor?.isSuspended() ? null : (input?.values ?? null);
    const valuesUnavailableReason = input?.valuesUnavailableReason ?? null;
    const requests = useMemo(() => advisor?.optimumRequests(), [advisor]);
    const engineJob = useMemo(() => {
        if (
            firmId === undefined ||
            optIns === undefined ||
            planSerial === undefined ||
            !requests?.length
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
    const valueJob = useMemo(() => {
        if (
            firmId === undefined ||
            optIns === undefined ||
            planSerial === undefined ||
            values === null
        ) {
            return null;
        }
        const request: AdvisorWorkerRequest = {
            firmId,
            optIns,
            planSerial,
            requests: [],
            values,
        };
        return { key: advisorWorkerCacheKey(request), request };
    }, [firmId, optIns, planSerial, values]);
    const engineTask = useCachedWorkerTask<
        ComputationId.Advice,
        AdvisorWorkerRequest
    >({
        createWorker: createAdvisorWorker,
        id: ComputationId.Advice,
        job: engineJob,
    });
    const valueTask = useCachedWorkerTask<
        ComputationId.Advice,
        AdvisorWorkerRequest
    >({
        createWorker: createAdvisorWorker,
        id: ComputationId.Advice,
        job: valueJob,
    });
    const outcome =
        engineTask.state.phase === WorkerTaskPhase.Done
            ? engineTask.state.result
            : null;
    const hasNoRequests = requests?.length === 0;
    const valuesState: AdviceValuesState =
        valuesUnavailableReason === null
            ? adviceValuesStateOf(valueJob !== null, valueTask)
            : {
                  phase: AdviceValuesPhase.Unavailable,
                  reason: valuesUnavailableReason,
              };
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
        return {
            ...ready,
            phase: AccountAdvicePhase.Ready,
            values: valuesState,
        };
    }
    if (engineTask.state.phase === WorkerTaskPhase.Failed) {
        return {
            phase: AccountAdvicePhase.Failed,
            reason: engineTask.state.reason,
            retry: engineTask.retry,
        };
    }
    return LOADING;
}

function adviceValuesStateOf(
    isRequested: boolean,
    task: CachedWorkerTask<never, AdvisorWorkerResult>,
): AdviceValuesState {
    if (!isRequested) return IDLE_VALUES;
    switch (task.state.phase) {
        case WorkerTaskPhase.Cancelled:
        case WorkerTaskPhase.Idle:
        case WorkerTaskPhase.Running: {
            return LOADING_VALUES;
        }
        case WorkerTaskPhase.Done: {
            const { values } = task.state.result;
            return values === undefined
                ? {
                      phase: AdviceValuesPhase.Failed,
                      reason: NO_VALUE_OUTCOME_REASON,
                      retry: task.retry,
                  }
                : { phase: AdviceValuesPhase.Ready, result: values };
        }
        case WorkerTaskPhase.Failed: {
            return {
                phase: AdviceValuesPhase.Failed,
                reason: task.state.reason,
                retry: task.retry,
            };
        }
    }
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
