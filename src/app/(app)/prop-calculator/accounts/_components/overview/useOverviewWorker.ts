'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { useWorkerTask } from '~/app/(app)/prop-calculator/_components/useWorkerTask';
import { WorkerTaskPhase } from '~/app/(app)/prop-calculator/_components/workerTaskState';
import {
    type OverviewOutcome,
    type OverviewRequest,
    overviewRequestKey,
    type OverviewWorkerRequest,
    type OverviewWorkerResult,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';

import { NO_OVERVIEW_ENGINE, type OverviewEngine } from './overviewModel';

const WORKERS_UNAVAILABLE = 'Web workers are not available in this browser.';
const OUTCOME_CACHE_CAPACITY = 64;

export class OverviewOutcomeCache {
    private readonly entries = new Map<string, OverviewOutcome>();

    constructor(readonly capacity = OUTCOME_CACHE_CAPACITY) {
        if (!Number.isSafeInteger(capacity) || capacity < 1) {
            throw new RangeError(
                `Overview outcome cache capacity must be a positive integer, got ${capacity}`,
            );
        }
    }

    clear(): void {
        this.entries.clear();
    }

    get(key: string): OverviewOutcome | undefined {
        const outcome = this.entries.get(key);
        if (outcome === undefined) return undefined;
        this.entries.delete(key);
        this.entries.set(key, outcome);
        return outcome;
    }

    set(outcome: OverviewOutcome): void {
        this.entries.delete(outcome.key);
        this.entries.set(outcome.key, outcome);
        while (this.entries.size > this.capacity) {
            const oldest = this.entries.keys().next();
            if (oldest.done) return;
            this.entries.delete(oldest.value);
        }
    }
}

export const overviewOutcomeCache = new OverviewOutcomeCache();

export function useOverviewWorker(
    requests: readonly OverviewRequest[],
): OverviewEngine {
    const task = useWorkerTask<
        OverviewWorkerRequest,
        OverviewWorkerResult,
        OverviewWorkerResult
    >(createOverviewWorker);
    const runReference = useRef(task.run);
    runReference.current = task.run;
    const requestsReference = useRef(requests);
    requestsReference.current = requests;
    const [delivered, setDelivered] = useState<
        ReadonlyMap<string, OverviewOutcome>
    >(() => new Map());
    const [failure, setFailure] = useState<null | string>(null);

    const requestsKey = useMemo(
        () => requests.map((request) => overviewRequestKey(request)).join('\n'),
        [requests],
    );
    const outcomes = useMemo(() => {
        const known = new Map<string, OverviewOutcome>();
        for (const request of requests) {
            const key = overviewRequestKey(request);
            const outcome = delivered.get(key) ?? overviewOutcomeCache.get(key);
            if (outcome !== undefined) known.set(key, outcome);
        }
        return known;
    }, [delivered, requests]);
    const engine = useMemo(() => ({ failure, outcomes }), [failure, outcomes]);

    useEffect(() => {
        const missing = requestsReference.current.filter(
            (request) =>
                overviewOutcomeCache.get(overviewRequestKey(request)) ===
                undefined,
        );
        if (missing.length === 0) return;
        setFailure(null);
        try {
            runReference.current({ requests: missing });
        } catch (error) {
            setFailure(
                error instanceof Error ? error.message : WORKERS_UNAVAILABLE,
            );
        }
    }, [requestsKey]);

    useEffect(() => {
        switch (task.state.phase) {
            case WorkerTaskPhase.Cancelled:
            case WorkerTaskPhase.Idle: {
                return;
            }
            case WorkerTaskPhase.Done: {
                remember(task.state.result.outcomes);
                setDelivered(merged(task.state.result.outcomes));
                return;
            }
            case WorkerTaskPhase.Failed: {
                setFailure(task.state.reason);
                return;
            }
            case WorkerTaskPhase.Running: {
                const { progress } = task.state;
                if (progress !== null) {
                    remember(progress.outcomes);
                    setDelivered(merged(progress.outcomes));
                }
                return;
            }
        }
    }, [task.state]);

    return failure === null && requests.length === 0
        ? NO_OVERVIEW_ENGINE
        : engine;
}

function createOverviewWorker(): Worker {
    if (typeof Worker === 'undefined') throw new Error(WORKERS_UNAVAILABLE);
    return new Worker(
        new URL('../../../_workers/overviewWorker.ts', import.meta.url),
        { type: 'module' },
    );
}

function merged(
    incoming: readonly OverviewOutcome[],
): (
    previous: ReadonlyMap<string, OverviewOutcome>,
) => ReadonlyMap<string, OverviewOutcome> {
    return (previous) =>
        new Map([
            ...previous,
            ...incoming.map((outcome) => [outcome.key, outcome] as const),
        ]);
}

function remember(incoming: readonly OverviewOutcome[]): void {
    for (const outcome of incoming) overviewOutcomeCache.set(outcome);
}
