import { describe, expect, it } from 'vitest';

import {
    IDLE_WORKER_TASK,
    reduceWorkerTask,
    type WorkerTaskEvent,
    WorkerTaskEventKind,
    WorkerTaskPhase,
    type WorkerTaskState,
} from '~/app/(app)/prop-calculator/_components/workerTaskState';

type Event = WorkerTaskEvent<Progress, string>;

interface Progress {
    completed: number;
}

type State = WorkerTaskState<Progress, string>;

const idle: State = IDLE_WORKER_TASK;

function run(events: readonly Event[], from: State = idle): State {
    return events.reduce<State>(
        (state, event) => reduceWorkerTask(state, event),
        from,
    );
}

const start = (runId: number): Event => ({
    kind: WorkerTaskEventKind.Start,
    runId,
});
const progress = (runId: number, completed: number): Event => ({
    kind: WorkerTaskEventKind.Progress,
    progress: { completed },
    runId,
});
const done = (runId: number, result: string): Event => ({
    kind: WorkerTaskEventKind.Done,
    result,
    runId,
});
const failed = (reason: string): Event => ({
    kind: WorkerTaskEventKind.Failed,
    reason,
    runId: 1,
});
const cancel: Event = { kind: WorkerTaskEventKind.Cancel };

describe('reduceWorkerTask', () => {
    it('starts Idle', () => {
        expect(idle).toEqual({ phase: WorkerTaskPhase.Idle });
    });

    it('goes Running on start with no progress yet', () => {
        expect(run([start(1)])).toEqual({
            phase: WorkerTaskPhase.Running,
            progress: null,
            runId: 1,
        });
    });

    it('keeps the latest progress while Running', () => {
        expect(run([start(1), progress(1, 3), progress(1, 7)])).toEqual({
            phase: WorkerTaskPhase.Running,
            progress: { completed: 7 },
            runId: 1,
        });
    });

    it('goes Done with the result', () => {
        expect(run([start(1), progress(1, 3), done(1, 'ok')])).toEqual({
            phase: WorkerTaskPhase.Done,
            result: 'ok',
            runId: 1,
        });
    });

    it('goes Failed with the reason', () => {
        expect(run([start(1), failed('boom')])).toEqual({
            phase: WorkerTaskPhase.Failed,
            reason: 'boom',
            runId: 1,
        });
    });

    it('cancels to Cancelled and keeps the progress', () => {
        expect(run([start(4), progress(4, 9), cancel])).toEqual({
            phase: WorkerTaskPhase.Cancelled,
            progress: { completed: 9 },
            runId: 4,
        });
    });

    it('cancels before any progress with null progress', () => {
        expect(run([start(4), cancel])).toEqual({
            phase: WorkerTaskPhase.Cancelled,
            progress: null,
            runId: 4,
        });
    });

    it('ignores a cancel when nothing is running', () => {
        expect(run([cancel])).toEqual(idle);
        const finished = run([start(1), done(1, 'ok')]);
        expect(reduceWorkerTask(finished, cancel)).toBe(finished);
    });

    it('ignores stale responses from an earlier run', () => {
        const state = run([start(1), progress(1, 2), start(2)]);
        expect(reduceWorkerTask(state, progress(1, 5))).toBe(state);
        expect(reduceWorkerTask(state, done(1, 'stale'))).toBe(state);
        expect(reduceWorkerTask(state, failed('stale'))).toBe(state);
        expect(run([done(2, 'fresh')], state)).toEqual({
            phase: WorkerTaskPhase.Done,
            result: 'fresh',
            runId: 2,
        });
    });

    it('ignores responses that arrive after a cancel or a finish', () => {
        const cancelled = run([start(1), progress(1, 2), cancel]);
        expect(reduceWorkerTask(cancelled, progress(1, 3))).toBe(cancelled);
        expect(reduceWorkerTask(cancelled, done(1, 'late'))).toBe(cancelled);
        const finished = run([start(1), done(1, 'ok')]);
        expect(reduceWorkerTask(finished, failed('late'))).toBe(finished);
    });

    it('ignores responses while Idle', () => {
        expect(reduceWorkerTask(idle, done(1, 'orphan'))).toBe(idle);
    });

    it('restarts from any finished phase', () => {
        for (const from of [
            run([start(1), done(1, 'ok')]),
            run([start(1), failed('x')]),
            run([start(1), cancel]),
        ]) {
            expect(reduceWorkerTask(from, start(2))).toEqual({
                phase: WorkerTaskPhase.Running,
                progress: null,
                runId: 2,
            });
        }
    });
});
