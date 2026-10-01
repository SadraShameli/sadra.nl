'use client';

import { useMemo, useSyncExternalStore } from 'react';

import { ComputationId } from '~/app/(app)/prop-calculator/_components/ComputationId';
import { useCachedWorkerTask } from '~/app/(app)/prop-calculator/_components/useCachedWorkerTask';
import {
    WorkerTaskPhase,
    type WorkerTaskState,
} from '~/app/(app)/prop-calculator/_components/workerTaskState';
import {
    type OverviewRequest,
    OverviewRequestGroup,
    overviewRequestsByGroup,
    overviewRequestsKey,
    type OverviewWorkerRequest,
    type OverviewWorkerResult,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';

import {
    type GroupDelivery,
    slotEngineFromGroups,
    uniformSlotEngine,
} from './engineSlot';
import { NO_OVERVIEW_ENGINE, type OverviewEngine } from './overviewModel';

const WORKERS_UNAVAILABLE = 'Web workers are not available in this browser.';

export function useOverviewWorker(
    requests: readonly OverviewRequest[],
): OverviewEngine {
    const isClient = useSyncExternalStore(
        subscribeNever,
        () => true,
        () => false,
    );
    const hasWorkers = isClient && typeof Worker !== 'undefined';
    const groups = useMemo(() => overviewRequestsByGroup(requests), [requests]);
    const accounts = useRequestGroupTask(
        groups[OverviewRequestGroup.Accounts],
        hasWorkers,
    );
    const policy = useRequestGroupTask(
        groups[OverviewRequestGroup.Policy],
        hasWorkers,
    );
    const projection = useRequestGroupTask(
        groups[OverviewRequestGroup.Projection],
        hasWorkers,
    );
    const values = useRequestGroupTask(
        groups[OverviewRequestGroup.Values],
        hasWorkers,
    );
    const areWorkersMissing = isClient && !hasWorkers && requests.length > 0;

    return useMemo(() => {
        if (areWorkersMissing) return unavailableEngine();
        const engine = slotEngineFromGroups({
            [OverviewRequestGroup.Accounts]: accounts,
            [OverviewRequestGroup.Policy]: policy,
            [OverviewRequestGroup.Projection]: projection,
            [OverviewRequestGroup.Values]: values,
        });
        return engine.failure === null && engine.outcomes.size === 0
            ? NO_OVERVIEW_ENGINE
            : engine;
    }, [accounts, areWorkersMissing, policy, projection, values]);
}

function createOverviewWorker(): Worker {
    return new Worker(
        new URL('../../../_workers/overviewWorker.ts', import.meta.url),
        { type: 'module' },
    );
}

function deliveredOf(
    state: WorkerTaskState<OverviewWorkerResult, OverviewWorkerResult>,
): null | OverviewWorkerResult {
    switch (state.phase) {
        case WorkerTaskPhase.Cancelled:
        case WorkerTaskPhase.Running: {
            return state.progress;
        }
        case WorkerTaskPhase.Done: {
            return state.result;
        }
        case WorkerTaskPhase.Failed:
        case WorkerTaskPhase.Idle: {
            return null;
        }
    }
}

function subscribeNever(): () => void {
    return unsubscribeNothing;
}

function unavailableEngine(): OverviewEngine {
    return uniformSlotEngine(WORKERS_UNAVAILABLE);
}

function unsubscribeNothing(): void {
    return;
}

function useRequestGroupTask(
    requests: readonly OverviewRequest[],
    hasWorkers: boolean,
): GroupDelivery {
    const job = useMemo(
        () =>
            hasWorkers && requests.length > 0
                ? { key: overviewRequestsKey(requests), request: { requests } }
                : null,
        [hasWorkers, requests],
    );
    const { state } = useCachedWorkerTask<
        ComputationId.Overview,
        OverviewWorkerRequest,
        OverviewWorkerResult
    >({ createWorker: createOverviewWorker, id: ComputationId.Overview, job });
    const delivered = deliveredOf(state);
    const failure =
        state.phase === WorkerTaskPhase.Failed ? state.reason : null;
    return useMemo(() => ({ delivered, failure }), [delivered, failure]);
}
