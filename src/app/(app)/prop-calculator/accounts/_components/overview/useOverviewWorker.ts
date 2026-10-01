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

import { NO_OVERVIEW_ENGINE, type OverviewEngine } from './overviewModel';

interface GroupTask {
    readonly delivered: null | OverviewWorkerResult;
    readonly failure: null | string;
}

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
    const failure =
        accounts.failure ??
        policy.failure ??
        projection.failure ??
        values.failure;
    const { delivered: accountsDelivered } = accounts;
    const { delivered: policyDelivered } = policy;
    const { delivered: projectionDelivered } = projection;
    const { delivered: valuesDelivered } = values;

    return useMemo(() => {
        if (areWorkersMissing) return unavailableEngine();
        const delivered = [
            ...(policyDelivered?.outcomes ?? []),
            ...(projectionDelivered?.outcomes ?? []),
            ...(valuesDelivered?.outcomes ?? []),
            ...(accountsDelivered?.outcomes ?? []),
        ];
        if (failure === null && delivered.length === 0) {
            return NO_OVERVIEW_ENGINE;
        }
        return {
            failure,
            outcomes: new Map(
                delivered.map((outcome) => [outcome.key, outcome]),
            ),
        };
    }, [
        accountsDelivered,
        areWorkersMissing,
        failure,
        policyDelivered,
        projectionDelivered,
        valuesDelivered,
    ]);
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
    return { failure: WORKERS_UNAVAILABLE, outcomes: new Map() };
}

function unsubscribeNothing(): void {
    return;
}

function useRequestGroupTask(
    requests: readonly OverviewRequest[],
    hasWorkers: boolean,
): GroupTask {
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
    return {
        delivered: deliveredOf(state),
        failure: state.phase === WorkerTaskPhase.Failed ? state.reason : null,
    };
}
