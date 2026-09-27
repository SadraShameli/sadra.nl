'use client';

import { useContext, useEffect, useRef, useState } from 'react';

import {
    fundedSweepCacheKey,
    type FundedSweepProgress,
    type FundedSweepRequest,
    type FundedSweepResult,
} from '../../_workers/fundedSweepWorkerMessages';
import { ComputationCache, initialFor } from '../computationCache';
import { ComputationId } from '../ComputationId';
import { ComputationCacheContext } from '../useDebouncedSimulation';
import { useWorkerTask } from '../useWorkerTask';
import { WorkerTaskPhase } from '../workerTaskState';

export interface FundedSweepState {
    readonly phase: WorkerTaskPhase;
    readonly progress: FundedSweepProgress | null;
    readonly reason: null | string;
    readonly result: FundedSweepResult | null;
}

export function useFundedSweep(request: FundedSweepRequest | null): FundedSweepState {
    const sharedCache = useContext(ComputationCacheContext);
    const [localCache] = useState(() => new ComputationCache());
    const cache = sharedCache ?? localCache;
    const task = useWorkerTask<
        FundedSweepRequest,
        FundedSweepProgress,
        FundedSweepResult
    >(createFundedSweepWorker);
    const runReference = useRef(task.run);
    runReference.current = task.run;
    const startedKeyReference = useRef<null | string>(null);
    const runKeyReference = useRef<null | { key: string; runId: number }>(null);

    const key = request === null ? null : fundedSweepCacheKey(request);
    const cached =
        key === null ? undefined : initialFor(ComputationId.FundedOptimizer, key, cache);

    useEffect(() => {
        if (request === null || key === null || (cached?.shouldCompute === false) || (startedKeyReference.current === key)) return;
        startedKeyReference.current = key;
        runReference.current(request);
    }, [cached?.shouldCompute, key, request]);

    useEffect(() => {
        if (
            key !== null &&
            task.state.phase === WorkerTaskPhase.Running &&
            runKeyReference.current?.runId !== task.state.runId
        ) {
            runKeyReference.current = { key, runId: task.state.runId };
        }
    }, [key, task.state]);

    useEffect(() => {
        if (
            key !== null &&
            task.state.phase === WorkerTaskPhase.Done &&
            runKeyReference.current?.runId === task.state.runId &&
            runKeyReference.current.key === key
        ) {
            cache.set(ComputationId.FundedOptimizer, key, task.state.result);
        }
    }, [cache, key, task.state]);

    if (key !== null && cached?.shouldCompute === false) {
        return {
            phase: WorkerTaskPhase.Done,
            progress: null,
            reason: null,
            result: cached.result,
        };
    }

    switch (task.state.phase) {
        case WorkerTaskPhase.Cancelled: {
            return {
                phase: task.state.phase,
                progress: task.state.progress,
                reason: null,
                result: null,
            };
        }
        case WorkerTaskPhase.Done: {
            return {
                phase: task.state.phase,
                progress: null,
                reason: null,
                result: task.state.result,
            };
        }
        case WorkerTaskPhase.Failed: {
            return {
                phase: task.state.phase,
                progress: null,
                reason: task.state.reason,
                result: null,
            };
        }
        case WorkerTaskPhase.Idle: {
            return { phase: task.state.phase, progress: null, reason: null, result: null };
        }
        case WorkerTaskPhase.Running: {
            return {
                phase: task.state.phase,
                progress: task.state.progress,
                reason: null,
                result: null,
            };
        }
    }
}

function createFundedSweepWorker(): Worker {
    return new Worker(new URL('../../_workers/fundedSweepWorker.ts', import.meta.url), {
        type: 'module',
    });
}
