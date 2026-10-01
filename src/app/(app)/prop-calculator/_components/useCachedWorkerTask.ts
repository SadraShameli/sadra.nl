'use client';

import { useCallback, useContext, useEffect, useRef, useState } from 'react';

import { ComputationCache } from '~/app/(app)/prop-calculator/_components/computationCache';
import {
    type ComputationId,
    type ComputationResultMap,
} from '~/app/(app)/prop-calculator/_components/ComputationId';
import {
    ComputationCacheContext,
    useDebouncedValue,
} from '~/app/(app)/prop-calculator/_components/useDebouncedSimulation';
import { useWorkerTask } from '~/app/(app)/prop-calculator/_components/useWorkerTask';
import {
    IDLE_WORKER_TASK,
    WorkerTaskPhase,
    type WorkerTaskState,
} from '~/app/(app)/prop-calculator/_components/workerTaskState';

export interface CachedWorkerJob<TRequest> {
    readonly key: string;
    readonly request: TRequest;
}

export interface CachedWorkerTask<TProgress, TResult> {
    readonly retry: () => void;
    readonly state: WorkerTaskState<TProgress, TResult>;
}

export interface CachedWorkerTaskOptions<
    Id extends ComputationId,
    TRequest,
> {
    readonly createWorker: () => Worker;
    readonly debounceMs?: number | undefined;
    readonly id: Id;
    readonly job: CachedWorkerJob<TRequest> | null;
}

const NO_DEBOUNCE_MS = 0;

export function useCachedWorkerTask<
    Id extends ComputationId,
    TRequest,
    TProgress = never,
>({
    createWorker,
    debounceMs = NO_DEBOUNCE_MS,
    id,
    job,
}: CachedWorkerTaskOptions<Id, TRequest>): CachedWorkerTask<
    TProgress,
    ComputationResultMap[Id]
> {
    const sharedCache = useContext(ComputationCacheContext);
    const [localCache] = useState(() => new ComputationCache());
    const cache = sharedCache ?? localCache;
    const task = useWorkerTask<TRequest, TProgress, ComputationResultMap[Id]>(
        createWorker,
    );
    const runReference = useRef(task.run);
    runReference.current = task.run;
    const startedKeyReference = useRef<null | string>(null);
    const runKeyReference = useRef<null | { key: string; runId: number }>(null);
    const [retryTick, setRetryTick] = useState(0);
    const key = job?.key ?? null;
    const debouncedKey = useDebouncedValue(key, debounceMs);
    const isFirstStart = startedKeyReference.current === null;
    const startJob =
        debounceMs === NO_DEBOUNCE_MS || isFirstStart || debouncedKey === key
            ? job
            : null;
    const cached = key === null ? undefined : cache.get(id, key);

    const retry = useCallback(() => {
        startedKeyReference.current = null;
        setRetryTick((tick) => tick + 1);
    }, []);

    useEffect(
        () => () => {
            startedKeyReference.current = null;
        },
        [],
    );

    useEffect(() => {
        if (
            startJob === null ||
            startedKeyReference.current === startJob.key ||
            cache.get(id, startJob.key) !== undefined
        ) {
            return;
        }
        startedKeyReference.current = startJob.key;
        runReference.current(startJob.request);
    }, [cache, id, retryTick, startJob]);

    useEffect(() => {
        if (
            startedKeyReference.current !== null &&
            task.state.phase === WorkerTaskPhase.Running &&
            runKeyReference.current?.runId !== task.state.runId
        ) {
            runKeyReference.current = {
                key: startedKeyReference.current,
                runId: task.state.runId,
            };
        }
    }, [task.state]);

    const isStateForKey =
        task.state.phase !== WorkerTaskPhase.Idle &&
        key !== null &&
        runKeyReference.current?.runId === task.state.runId &&
        runKeyReference.current.key === key;
    const finishedResult =
        isStateForKey && task.state.phase === WorkerTaskPhase.Done
            ? task.state.result
            : undefined;

    useEffect(() => {
        if (key !== null && finishedResult !== undefined) {
            cache.set(id, key, finishedResult);
        }
    }, [cache, finishedResult, id, key]);

    return {
        retry,
        state: stateFor(task.state, key, cached, isStateForKey),
    };
}

function stateFor<TProgress, TResult>(
    state: WorkerTaskState<TProgress, TResult>,
    key: null | string,
    cached: TResult | undefined,
    isStateForKey: boolean,
): WorkerTaskState<TProgress, TResult> {
    if (key === null) return IDLE_WORKER_TASK;
    if (cached !== undefined) {
        return { phase: WorkerTaskPhase.Done, result: cached, runId: 0 };
    }
    if (
        !isStateForKey &&
        (state.phase === WorkerTaskPhase.Done ||
            state.phase === WorkerTaskPhase.Failed)
    ) {
        return {
            phase: WorkerTaskPhase.Running,
            progress: null,
            runId: state.runId,
        };
    }
    return state;
}
