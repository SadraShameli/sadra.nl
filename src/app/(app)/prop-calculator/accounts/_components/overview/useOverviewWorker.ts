'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

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

const PROGRESS_INTERVAL_MS = 400;

interface ShownProgress<Value> {
    readonly jobKey: null | string;
    readonly shownAt: number;
    readonly value: Value;
}

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
    const delivered = useThrottledProgress(
        deliveredOf(state),
        state.phase === WorkerTaskPhase.Running ? (job?.key ?? null) : null,
    );
    const failure =
        state.phase === WorkerTaskPhase.Failed ? state.reason : null;
    return useMemo(() => ({ delivered, failure }), [delivered, failure]);
}

function useThrottledProgress<Value>(
    value: Value,
    runningJobKey: null | string,
): Value {
    const [shown, setShown] = useState<ShownProgress<Value>>({
        jobKey: runningJobKey,
        shownAt: -Infinity,
        value,
    });
    if (shown.jobKey !== runningJobKey) {
        setShown({ jobKey: runningJobKey, shownAt: -Infinity, value });
    }
    useEffect(() => {
        if (runningJobKey === null || shown.value === value) return;
        const show = () => {
            setShown({
                jobKey: runningJobKey,
                shownAt: performance.now(),
                value,
            });
        };
        const wait = shown.shownAt + PROGRESS_INTERVAL_MS - performance.now();
        if (wait <= 0) {
            show();
            return;
        }
        const timer = setTimeout(show, wait);
        return () => {
            clearTimeout(timer);
        };
    }, [runningJobKey, shown, value]);
    return runningJobKey === null ? value : shown.value;
}
