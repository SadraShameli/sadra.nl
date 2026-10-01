'use client';

import { useMemo } from 'react';

import { ComputationId } from '~/app/(app)/prop-calculator/_components/ComputationId';
import { useCachedWorkerTask } from '~/app/(app)/prop-calculator/_components/useCachedWorkerTask';
import { WorkerTaskPhase } from '~/app/(app)/prop-calculator/_components/workerTaskState';
import {
    fundedSweepCacheKey,
    type FundedSweepProgress,
    type FundedSweepRequest,
    type FundedSweepResult,
} from '~/app/(app)/prop-calculator/_workers/fundedSweepWorkerMessages';

export interface FundedSweepState {
    readonly phase: WorkerTaskPhase;
    readonly progress: FundedSweepProgress | null;
    readonly reason: null | string;
    readonly result: FundedSweepResult | null;
}

export function useFundedSweep(request: FundedSweepRequest | null): FundedSweepState {
    const job = useMemo(
        () => (request === null ? null : { key: fundedSweepCacheKey(request), request }),
        [request],
    );
    const { state } = useCachedWorkerTask<
        ComputationId.FundedOptimizer,
        FundedSweepRequest,
        FundedSweepProgress
    >({
        createWorker: createFundedSweepWorker,
        id: ComputationId.FundedOptimizer,
        job,
    });

    switch (state.phase) {
        case WorkerTaskPhase.Cancelled: {
            return {
                phase: state.phase,
                progress: state.progress,
                reason: null,
                result: null,
            };
        }
        case WorkerTaskPhase.Done: {
            return {
                phase: state.phase,
                progress: null,
                reason: null,
                result: state.result,
            };
        }
        case WorkerTaskPhase.Failed: {
            return {
                phase: state.phase,
                progress: null,
                reason: state.reason,
                result: null,
            };
        }
        case WorkerTaskPhase.Idle: {
            return { phase: state.phase, progress: null, reason: null, result: null };
        }
        case WorkerTaskPhase.Running: {
            return {
                phase: state.phase,
                progress: state.progress,
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
