import { MessageChannel, Worker } from 'node:worker_threads';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    awaitWorkerSignal,
    runAndSignal,
    WorkerSignal,
} from '~/lib/prop-calculator/core/lib/workerSignal';

function freshFlags(): Int32Array {
    return new Int32Array(new SharedArrayBuffer(8));
}

const LATE_RESULT = 42;

const STALE_WAKE_ESCAPE_MS = 1000;

const LATE_NOTIFY_WORKER_SOURCE = `
const { workerData } = require('node:worker_threads');
const flags = new Int32Array(workerData.flagsSAB);
const results = new Float64Array(workerData.resultsSAB);
const pause = new Int32Array(new SharedArrayBuffer(4));
while (Atomics.notify(flags, 0, 1) === 0) Atomics.wait(pause, 0, 0, 1);
Atomics.wait(pause, 0, 0, 50);
if (workerData.isFailing) {
    workerData.errorPort.postMessage('snapshot key out of range');
    Atomics.store(flags, 0, ${WorkerSignal.Failed});
} else {
    results[0] = ${LATE_RESULT};
    Atomics.store(flags, 0, ${WorkerSignal.Done});
}
Atomics.notify(flags, 0, 1);
`;

interface LateNotifyRun {
    readonly error: unknown;
    readonly flagAfterWait: number;
    readonly resultAfterWait: number;
}

describe('worker dispatch signalling', () => {
    const channels: MessageChannel[] = [];

    function openChannel() {
        const channel = new MessageChannel();
        channels.push(channel);
        return channel;
    }

    const workers: Worker[] = [];

    afterEach(async () => {
        for (const { port1, port2 } of channels.splice(0)) {
            port1.close();
            port2.close();
        }
        await Promise.all(
            workers.splice(0).map((worker) => worker.terminate()),
        );
    });

    async function waitThroughLateNotify(
        isFailing: boolean,
    ): Promise<LateNotifyRun> {
        const flagsSAB = new SharedArrayBuffer(4);
        const resultsSAB = new SharedArrayBuffer(8);
        const flags = new Int32Array(flagsSAB);
        const results = new Float64Array(resultsSAB);
        const { port1, port2 } = openChannel();
        Atomics.store(flags, 0, WorkerSignal.Pending);
        const worker = new Worker(LATE_NOTIFY_WORKER_SOURCE, {
            eval: true,
            transferList: [port2],
            workerData: { errorPort: port2, flagsSAB, isFailing, resultsSAB },
        });
        workers.push(worker);
        let error: unknown = null;
        try {
            awaitWorkerSignal(flags, 0, port1, 10_000, 'FundedStateValue');
        } catch (error_) {
            error = error_;
        }
        const run = {
            error,
            flagAfterWait: Atomics.load(flags, 0),
            resultAfterWait: results[0] ?? NaN,
        };
        await new Promise((resolve) => worker.once('exit', resolve));
        return run;
    }

    it('marks a finished dispatch done and lets the waiting side return', () => {
        const flags = freshFlags();
        const { port1, port2 } = openChannel();
        let wasRun = false;
        runAndSignal(flags, 1, port2, () => {
            wasRun = true;
        });
        expect(wasRun).toBe(true);
        expect(Atomics.load(flags, 1)).toBe(WorkerSignal.Done);
        expect(() =>
            awaitWorkerSignal(flags, 1, port1, 1000, 'FundedStateValue'),
        ).not.toThrow();
    });

    it("rethrows the worker's own error on the waiting side instead of a timeout", () => {
        const flags = freshFlags();
        const { port1, port2 } = openChannel();
        runAndSignal(flags, 0, port2, () => {
            throw new RangeError(
                'value key 99 is outside the shared snapshot (length 12)',
            );
        });
        expect(Atomics.load(flags, 0)).toBe(WorkerSignal.Failed);
        expect(() =>
            awaitWorkerSignal(flags, 0, port1, 60_000, 'FundedStateValue'),
        ).toThrow(
            'FundedStateValue: worker 0 failed: value key 99 is outside the shared snapshot (length 12)',
        );
    });

    it('reports a timeout when the worker never signals', () => {
        const flags = freshFlags();
        const { port1 } = openChannel();
        expect(() =>
            awaitWorkerSignal(flags, 0, port1, 5, 'FundedStateValue'),
        ).toThrow('FundedStateValue: worker 0 did not finish within 5 ms');
    });

    it('keeps waiting through a wake-up that arrives while the flag is still pending (the late notify of the previous dispatch), and returns only once the worker signals done', async () => {
        const run = await waitThroughLateNotify(false);

        expect(run.error).toBeNull();
        expect(run.flagAfterWait).toBe(WorkerSignal.Done);
        expect(run.resultAfterWait).toBe(LATE_RESULT);
    });

    it("still rethrows the worker's own error when it fails after such a wake-up", async () => {
        const run = await waitThroughLateNotify(true);

        expect(run.flagAfterWait).toBe(WorkerSignal.Failed);
        expect(run.error).toBeInstanceOf(Error);
        expect(String(run.error)).toContain(
            'FundedStateValue: worker 0 failed: snapshot key out of range',
        );
    });

    it('bounds the whole wait by one timeout while stale wake-ups keep arriving and the flag stays pending', () => {
        const flags = freshFlags();
        const { port1 } = openChannel();
        const realWait = Atomics.wait.bind(Atomics);
        const pause = new Int32Array(new SharedArrayBuffer(4));
        const started = performance.now();
        let staleWakeUps = 0;
        const waitSpy = vi
            .spyOn(Atomics, 'wait')
            .mockImplementation((array, index, value, timeout) => {
                if (array.buffer !== flags.buffer) {
                    return realWait(array, index, value, timeout);
                }
                if (performance.now() - started > STALE_WAKE_ESCAPE_MS) {
                    throw new Error(
                        `still waiting after ${STALE_WAKE_ESCAPE_MS} ms of stale wake-ups`,
                    );
                }
                staleWakeUps += 1;
                realWait(pause, 0, 0, 1);
                return 'ok';
            });
        try {
            expect(() =>
                awaitWorkerSignal(flags, 0, port1, 40, 'FundedStateValue'),
            ).toThrow('FundedStateValue: worker 0 did not finish within 40 ms');
        } finally {
            waitSpy.mockRestore();
        }
        expect(staleWakeUps).toBeGreaterThan(1);
        expect(Atomics.load(flags, 0)).toBe(WorkerSignal.Pending);
        expect(performance.now() - started).toBeLessThan(STALE_WAKE_ESCAPE_MS);
    });
});
