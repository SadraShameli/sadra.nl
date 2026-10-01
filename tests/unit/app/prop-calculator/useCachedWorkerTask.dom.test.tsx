import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ComputationCache } from '~/app/(app)/prop-calculator/_components/computationCache';
import { ComputationId } from '~/app/(app)/prop-calculator/_components/ComputationId';
import {
    type CachedWorkerJob,
    type CachedWorkerTask,
    useCachedWorkerTask,
} from '~/app/(app)/prop-calculator/_components/useCachedWorkerTask';
import { ComputationCacheContext } from '~/app/(app)/prop-calculator/_components/useDebouncedSimulation';
import {
    IDLE_WORKER_TASK,
    reduceWorkerTask,
    type WorkerTaskEvent,
    WorkerTaskEventKind,
    WorkerTaskPhase,
    type WorkerTaskState,
} from '~/app/(app)/prop-calculator/_components/workerTaskState';
import { type PayoutSweepResult } from '~/app/(app)/prop-calculator/_workers/payoutSweepWorkerMessages';
import { PayoutSizeSweepResultKind } from '~/lib/prop-calculator/advisor';

interface TestRequest {
    readonly label: string;
}

const fakeWorker = vi.hoisted(() => ({
    createWorkerCalls: 0,
    dispatch: null as ((event: WorkerTaskEvent<never, unknown>) => void) | null,
    liveRunId: null as null | number,
    runId: 0,
    runSpy: vi.fn<(request: unknown) => void>(),
}));

vi.mock('~/app/(app)/prop-calculator/_components/useWorkerTask', async () => {
    const React = await import('react');
    return {
        useWorkerTask: () => {
            const [state, dispatch] = React.useReducer<
                WorkerTaskState<never, unknown>,
                [WorkerTaskEvent<never, unknown>]
            >(reduceWorkerTask, IDLE_WORKER_TASK);
            fakeWorker.dispatch = dispatch;
            const runIdReference = React.useRef(0);
            React.useEffect(
                () => () => {
                    fakeWorker.liveRunId = null;
                },
                [],
            );
            const run = React.useCallback((request: unknown) => {
                runIdReference.current += 1;
                fakeWorker.runId = runIdReference.current;
                fakeWorker.liveRunId = runIdReference.current;
                fakeWorker.runSpy(request);
                dispatch({
                    kind: WorkerTaskEventKind.Start,
                    runId: runIdReference.current,
                });
            }, []);
            const cancel = React.useCallback(() => {
                dispatch({ kind: WorkerTaskEventKind.Cancel });
            }, []);
            return { cancel, run, state };
        },
    };
});

type Task = CachedWorkerTask<never, PayoutSweepResult>;

const DEBOUNCE_MS = 100;

function createWorker(): Worker {
    fakeWorker.createWorkerCalls += 1;
    return new EventTarget() as unknown as Worker;
}

function failed(reason: string) {
    act(() => {
        fakeWorker.dispatch?.({
            kind: WorkerTaskEventKind.Failed,
            reason,
            runId: fakeWorker.runId,
        });
    });
}

function finish(result: PayoutSweepResult) {
    act(() => {
        fakeWorker.dispatch?.({
            kind: WorkerTaskEventKind.Done,
            result,
            runId: fakeWorker.runId,
        });
    });
}

function job(label: string): CachedWorkerJob<TestRequest> {
    return { key: `key-${label}`, request: { label } };
}

function result(label: string): PayoutSweepResult {
    return { issue: label, kind: PayoutSizeSweepResultKind.NoOptimum };
}

describe('useCachedWorkerTask', () => {
    let root: Root;
    let container: HTMLElement;
    let cache: ComputationCache;
    const latest: { current: null | Task } = { current: null };

    function Harness({
        debounceMs,
        job: current,
    }: {
        debounceMs?: number | undefined;
        job: CachedWorkerJob<TestRequest> | null;
    }) {
        latest.current = useCachedWorkerTask<
            ComputationId.PayoutSweep,
            TestRequest
        >({
            createWorker,
            debounceMs,
            id: ComputationId.PayoutSweep,
            job: current,
        });
        return null;
    }

    function render(
        current: CachedWorkerJob<TestRequest> | null,
        debounceMs?: number,
    ) {
        act(() => {
            root.render(
                <ComputationCacheContext.Provider value={cache}>
                    <Harness debounceMs={debounceMs} job={current} />
                </ComputationCacheContext.Provider>,
            );
        });
    }

    function phase(): undefined | WorkerTaskPhase {
        return latest.current?.state.phase;
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        vi.useFakeTimers();
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        cache = new ComputationCache();
        fakeWorker.dispatch = null;
        fakeWorker.runId = 0;
        fakeWorker.liveRunId = null;
        fakeWorker.runSpy = vi.fn();
        fakeWorker.createWorkerCalls = 0;
        latest.current = null;
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('is idle and runs nothing for a null job', () => {
        render(null);
        expect(phase()).toBe(WorkerTaskPhase.Idle);
        expect(fakeWorker.runSpy).not.toHaveBeenCalled();
    });

    it('runs a job once and caches its result under the job key', () => {
        const current = job('a');
        render(current);
        render(current);
        expect(fakeWorker.runSpy).toHaveBeenCalledTimes(1);
        expect(fakeWorker.runSpy).toHaveBeenCalledWith(current.request);
        expect(phase()).toBe(WorkerTaskPhase.Running);

        finish(result('a'));

        expect(cache.get(ComputationId.PayoutSweep, 'key-a')).toEqual(result('a'));
        expect(latest.current?.state).toMatchObject({
            phase: WorkerTaskPhase.Done,
            result: result('a'),
        });
    });

    it('serves a cached key without running the worker', () => {
        cache.set(ComputationId.PayoutSweep, 'key-a', result('cached'));

        render(job('a'));

        expect(fakeWorker.runSpy).not.toHaveBeenCalled();
        expect(latest.current?.state).toMatchObject({
            phase: WorkerTaskPhase.Done,
            result: result('cached'),
        });
    });

    it('never caches the previous run result under the new key and shows the new key as running', () => {
        render(job('a'));
        render(job('b'));
        expect(fakeWorker.runSpy).toHaveBeenCalledTimes(2);

        finish(result('b'));

        expect(cache.get(ComputationId.PayoutSweep, 'key-a')).toBeUndefined();
        expect(cache.get(ComputationId.PayoutSweep, 'key-b')).toEqual(result('b'));
    });

    it('does not show a finished result of another key while the new key has not run yet', () => {
        render(job('a'), DEBOUNCE_MS);
        finish(result('a'));
        expect(phase()).toBe(WorkerTaskPhase.Done);

        render(job('b'), DEBOUNCE_MS);

        expect(phase()).toBe(WorkerTaskPhase.Running);
        expect(cache.get(ComputationId.PayoutSweep, 'key-b')).toBeUndefined();
    });

    it('does not show a failure of another key for the new key', () => {
        render(job('a'));
        failed('boom');
        expect(latest.current?.state).toMatchObject({
            phase: WorkerTaskPhase.Failed,
            reason: 'boom',
        });

        render(job('b'));

        expect(phase()).toBe(WorkerTaskPhase.Running);
    });

    it('runs the first job at once and waits for the debounce before running a changed job', () => {
        render(job('a'), DEBOUNCE_MS);
        expect(fakeWorker.runSpy).toHaveBeenCalledTimes(1);

        render(job('b'), DEBOUNCE_MS);
        act(() => {
            vi.advanceTimersByTime(DEBOUNCE_MS - 1);
        });
        expect(fakeWorker.runSpy).toHaveBeenCalledTimes(1);

        act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(fakeWorker.runSpy).toHaveBeenCalledTimes(2);
        expect(fakeWorker.runSpy).toHaveBeenLastCalledWith({ label: 'b' });
    });

    it('runs the first job at once when it arrives after a null job, as the planner does once its rulebook resolves', () => {
        render(null, DEBOUNCE_MS);
        expect(fakeWorker.runSpy).not.toHaveBeenCalled();

        render(job('a'), DEBOUNCE_MS);

        expect(fakeWorker.runSpy).toHaveBeenCalledTimes(1);
        expect(fakeWorker.runSpy).toHaveBeenCalledWith({ label: 'a' });
    });

    it('still debounces a changed job after the first job arrived late', () => {
        render(null, DEBOUNCE_MS);
        render(job('a'), DEBOUNCE_MS);
        render(job('b'), DEBOUNCE_MS);
        expect(fakeWorker.runSpy).toHaveBeenCalledTimes(1);

        act(() => {
            vi.advanceTimersByTime(DEBOUNCE_MS);
        });

        expect(fakeWorker.runSpy).toHaveBeenCalledTimes(2);
        expect(fakeWorker.runSpy).toHaveBeenLastCalledWith({ label: 'b' });
    });

    it('keeps a live worker for the job under StrictMode, which unmounts and remounts the effects once', () => {
        act(() => {
            root.render(
                <StrictMode>
                    <ComputationCacheContext.Provider value={cache}>
                        <Harness debounceMs={DEBOUNCE_MS} job={job('a')} />
                    </ComputationCacheContext.Provider>
                </StrictMode>,
            );
        });

        expect(fakeWorker.liveRunId).not.toBeNull();
        expect(fakeWorker.runSpy).toHaveBeenLastCalledWith({ label: 'a' });
    });

    it('runs only the last of several jobs changed inside the debounce window', () => {
        render(job('a'), DEBOUNCE_MS);
        render(job('b'), DEBOUNCE_MS);
        render(job('c'), DEBOUNCE_MS);

        act(() => {
            vi.advanceTimersByTime(DEBOUNCE_MS);
        });

        expect(fakeWorker.runSpy).toHaveBeenCalledTimes(2);
        expect(fakeWorker.runSpy).toHaveBeenLastCalledWith({ label: 'c' });
    });

    it('does not keep re-rendering when the caller rebuilds an equal job on every render', () => {
        let renders = 0;
        function Rebuilding() {
            renders += 1;
            latest.current = useCachedWorkerTask<
                ComputationId.PayoutSweep,
                TestRequest
            >({
                createWorker,
                debounceMs: DEBOUNCE_MS,
                id: ComputationId.PayoutSweep,
                job: job('a'),
            });
            return null;
        }
        act(() => {
            root.render(
                <ComputationCacheContext.Provider value={cache}>
                    <Rebuilding />
                </ComputationCacheContext.Provider>,
            );
        });
        act(() => {
            vi.advanceTimersByTime(DEBOUNCE_MS);
        });
        const rendersAfterFirstDebounce = renders;

        act(() => {
            vi.advanceTimersByTime(DEBOUNCE_MS * 10);
        });

        expect(renders).toBe(rendersAfterFirstDebounce);
        expect(fakeWorker.runSpy).toHaveBeenCalledTimes(1);
    });

    it('runs a failed key again after retry', () => {
        render(job('a'));
        failed('boom');
        expect(fakeWorker.runSpy).toHaveBeenCalledTimes(1);

        act(() => {
            latest.current?.retry();
        });

        expect(fakeWorker.runSpy).toHaveBeenCalledTimes(2);
        expect(phase()).toBe(WorkerTaskPhase.Running);
    });

    it('keeps the same key cached across a remount through the shared cache', () => {
        render(job('a'));
        finish(result('a'));
        act(() => root.unmount());
        root = createRoot(container);

        render(job('a'));

        expect(fakeWorker.runSpy).toHaveBeenCalledTimes(1);
        expect(phase()).toBe(WorkerTaskPhase.Done);
    });
});
