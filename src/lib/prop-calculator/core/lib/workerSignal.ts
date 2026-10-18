import { type MessagePort, receiveMessageOnPort } from 'node:worker_threads';

export enum WorkerSignal {
    Pending = 0,
    Done = 1,
    Failed = 2,
}

const HEARTBEAT_POLL_MS = 1000;

export function awaitWorkerSignal(
    flags: Int32Array,
    workerIndex: number,
    errorPort: MessagePort,
    silenceTimeoutMs: number,
    label: string,
    heartbeats?: Int32Array,
): void {
    const pending: number = WorkerSignal.Pending;
    let lastBeat =
        heartbeats === undefined ? 0 : Atomics.load(heartbeats, workerIndex);
    let silentSinceMs = performance.now();
    while (Atomics.load(flags, workerIndex) === pending) {
        const nowMs = performance.now();
        if (heartbeats !== undefined) {
            const beat = Atomics.load(heartbeats, workerIndex);
            if (beat !== lastBeat) {
                lastBeat = beat;
                silentSinceMs = nowMs;
            }
        }
        const remainingMs = silentSinceMs + silenceTimeoutMs - nowMs;
        if (remainingMs <= 0) {
            throw new Error(
                `${label}: worker ${workerIndex} did not finish within ${silenceTimeoutMs} ms (it may have failed to load)`,
            );
        }
        Atomics.wait(
            flags,
            workerIndex,
            pending,
            Math.min(remainingMs, HEARTBEAT_POLL_MS),
        );
    }
    const failed: number = WorkerSignal.Failed;
    if (Atomics.load(flags, workerIndex) !== failed) return;
    const received = receiveMessageOnPort(errorPort);
    const reason =
        received === undefined
            ? 'it reported a failure but its error message never arrived'
            : String(received.message);
    throw new Error(`${label}: worker ${workerIndex} failed: ${reason}`);
}

export function recordHeartbeat(
    heartbeats: Int32Array,
    workerIndex: number,
): void {
    Atomics.add(heartbeats, workerIndex, 1);
}

export function runAndSignal(
    flags: Int32Array,
    workerIndex: number,
    errorPort: MessagePort,
    work: () => void,
): void {
    try {
        work();
        Atomics.store(flags, workerIndex, WorkerSignal.Done);
    } catch (error) {
        errorPort.postMessage(
            error instanceof Error ? error.message : String(error),
        );
        Atomics.store(flags, workerIndex, WorkerSignal.Failed);
    }
    Atomics.notify(flags, workerIndex, 1);
}
