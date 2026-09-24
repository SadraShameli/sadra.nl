import { type MessagePort, receiveMessageOnPort } from 'node:worker_threads';

export enum WorkerSignal {
    Pending = 0,
    Done = 1,
    Failed = 2,
}

export function awaitWorkerSignal(
    flags: Int32Array,
    workerIndex: number,
    errorPort: MessagePort,
    timeoutMs: number,
    label: string,
): void {
    const outcome = Atomics.wait(
        flags,
        workerIndex,
        WorkerSignal.Pending,
        timeoutMs,
    );
    if (outcome === 'timed-out') {
        throw new Error(
            `${label}: worker ${workerIndex} did not finish within ${timeoutMs} ms (it may have failed to load)`,
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
