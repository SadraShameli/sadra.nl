import { MessageChannel } from 'node:worker_threads';
import { afterEach, describe, expect, it } from 'vitest';

import {
    awaitWorkerSignal,
    runAndSignal,
    WorkerSignal,
} from '~/lib/prop-calculator/core/lib/workerSignal';

function freshFlags(): Int32Array {
    return new Int32Array(new SharedArrayBuffer(8));
}

describe('worker dispatch signalling', () => {
    const channels: MessageChannel[] = [];

    function openChannel() {
        const channel = new MessageChannel();
        channels.push(channel);
        return channel;
    }

    afterEach(() => {
        for (const { port1, port2 } of channels.splice(0)) {
            port1.close();
            port2.close();
        }
    });

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
});
