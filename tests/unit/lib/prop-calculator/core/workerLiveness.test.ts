import { MessageChannel } from 'node:worker_threads';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    awaitWorkerSignal,
    WorkerSignal,
} from '~/lib/prop-calculator/core/lib/workerSignal';

const SILENCE_TIMEOUT_MS = 100;
const BEAT_INTERVAL_MS = 40;
const ALIVE_DURATION_MS = 2000;
const LABEL = 'FundedStateValue';

interface VirtualWorker {
    readonly elapsedMs: () => number;
    readonly flags: Int32Array;
    readonly heartbeats: Int32Array;
    readonly port: MessageChannel['port1'];
}

describe('worker liveness: a slow but alive worker is waited for, a silent one is not (WP58f)', () => {
    const channels: MessageChannel[] = [];
    const realWait = Atomics.wait.bind(Atomics);

    afterEach(() => {
        vi.restoreAllMocks();
        for (const { port1, port2 } of channels.splice(0)) {
            port1.close();
            port2.close();
        }
    });

    function virtualWorker(
        beatUntilMs: number,
        finishAtMs: null | number,
    ): VirtualWorker {
        const flags = new Int32Array(new SharedArrayBuffer(4));
        const heartbeats = new Int32Array(new SharedArrayBuffer(4));
        const channel = new MessageChannel();
        channels.push(channel);
        let clockMs = 0;
        vi.spyOn(performance, 'now').mockImplementation(() => clockMs);
        vi.spyOn(Atomics, 'wait').mockImplementation(
            (array, index, value, timeout) => {
                if (array.buffer !== flags.buffer) {
                    return realWait(array, index, value, timeout);
                }
                const slice = Math.min(
                    timeout ?? BEAT_INTERVAL_MS,
                    BEAT_INTERVAL_MS,
                );
                clockMs += slice;
                if (clockMs <= beatUntilMs) Atomics.add(heartbeats, 0, 1);
                if (finishAtMs !== null && clockMs >= finishAtMs) {
                    Atomics.store(flags, 0, WorkerSignal.Done);
                }
                return 'ok';
            },
        );
        return {
            elapsedMs: () => clockMs,
            flags,
            heartbeats,
            port: channel.port1,
        };
    }

    it('keeps waiting for a worker that beats the whole time, however far past the silence timeout the dispatch runs, and returns once it signals done', () => {
        const worker = virtualWorker(ALIVE_DURATION_MS, ALIVE_DURATION_MS);

        expect(() =>
            awaitWorkerSignal(
                worker.flags,
                0,
                worker.port,
                SILENCE_TIMEOUT_MS,
                LABEL,
                worker.heartbeats,
            ),
        ).not.toThrow();
        expect(worker.elapsedMs()).toBeGreaterThanOrEqual(ALIVE_DURATION_MS);
        expect(Atomics.load(worker.flags, 0)).toBe(WorkerSignal.Done);
    });

    it('throws with the dispatch message once a worker that beat for a while has then been silent for the whole timeout, and does so promptly', () => {
        const beatUntilMs = 12 * BEAT_INTERVAL_MS;
        const worker = virtualWorker(beatUntilMs, null);

        expect(() =>
            awaitWorkerSignal(
                worker.flags,
                0,
                worker.port,
                SILENCE_TIMEOUT_MS,
                LABEL,
                worker.heartbeats,
            ),
        ).toThrow(
            `${LABEL}: worker 0 did not finish within ${SILENCE_TIMEOUT_MS} ms (it may have failed to load)`,
        );
        expect(worker.elapsedMs()).toBeGreaterThanOrEqual(
            beatUntilMs + SILENCE_TIMEOUT_MS,
        );
        expect(worker.elapsedMs()).toBeLessThan(
            beatUntilMs + SILENCE_TIMEOUT_MS + 2 * BEAT_INTERVAL_MS,
        );
    });

    it('still fails loudly, within the silence timeout, for a worker that never beats at all (it never loaded)', () => {
        const worker = virtualWorker(0, null);

        expect(() =>
            awaitWorkerSignal(
                worker.flags,
                0,
                worker.port,
                SILENCE_TIMEOUT_MS,
                LABEL,
                worker.heartbeats,
            ),
        ).toThrow(
            `${LABEL}: worker 0 did not finish within ${SILENCE_TIMEOUT_MS} ms (it may have failed to load)`,
        );
        expect(worker.elapsedMs()).toBeLessThan(
            SILENCE_TIMEOUT_MS + 2 * BEAT_INTERVAL_MS,
        );
    });

    it('treats a call without a heartbeat array as a plain deadline, as before', () => {
        const worker = virtualWorker(ALIVE_DURATION_MS, ALIVE_DURATION_MS);

        expect(() =>
            awaitWorkerSignal(
                worker.flags,
                0,
                worker.port,
                SILENCE_TIMEOUT_MS,
                LABEL,
            ),
        ).toThrow(`${LABEL}: worker 0 did not finish within`);
        expect(worker.elapsedMs()).toBeLessThan(
            SILENCE_TIMEOUT_MS + 2 * BEAT_INTERVAL_MS,
        );
    });
});
