'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';

import {
    IDLE_WORKER_TASK,
    reduceWorkerTask,
    type WorkerTaskEvent,
    WorkerTaskEventKind,
    type WorkerTaskMessage,
    type WorkerTaskRequest,
    type WorkerTaskState,
} from './workerTaskState';

export interface WorkerTask<TRequest, TProgress, TResult> {
    cancel: () => void;
    run: (request: TRequest) => void;
    state: WorkerTaskState<TProgress, TResult>;
}

const WORKER_FAILURE = 'The background worker failed.';

export function useWorkerTask<TRequest, TProgress, TResult>(
    createWorker: () => Worker,
): WorkerTask<TRequest, TProgress, TResult> {
    const [state, dispatch] = useReducer<
        WorkerTaskState<TProgress, TResult>,
        [WorkerTaskEvent<TProgress, TResult>]
    >(reduceWorkerTask, IDLE_WORKER_TASK);
    const workerFactoryReference = useRef(createWorker);
    workerFactoryReference.current = createWorker;
    const workerReference = useRef<null | Worker>(null);
    const runIdReference = useRef(0);

    const terminate = useCallback(() => {
        workerReference.current?.terminate();
        workerReference.current = null;
    }, []);

    useEffect(() => terminate, [terminate]);

    const cancel = useCallback(() => {
        terminate();
        dispatch({ kind: WorkerTaskEventKind.Cancel });
    }, [terminate]);

    const run = useCallback(
        (request: TRequest) => {
            terminate();
            runIdReference.current += 1;
            const runId = runIdReference.current;
            const worker = workerFactoryReference.current();
            workerReference.current = worker;
            dispatch({ kind: WorkerTaskEventKind.Start, runId });
            worker.addEventListener(
                'message',
                (
                    event: MessageEvent<WorkerTaskMessage<TProgress, TResult>>,
                ) => {
                    dispatch(event.data);
                    if (
                        event.data.kind !== WorkerTaskEventKind.Progress &&
                        workerReference.current === worker
                    ) {
                        terminate();
                    }
                },
            );
            worker.addEventListener('error', () => {
                dispatch({
                    kind: WorkerTaskEventKind.Failed,
                    reason: WORKER_FAILURE,
                    runId,
                });
                if (workerReference.current === worker) terminate();
            });
            const message: WorkerTaskRequest<TRequest> = { request, runId };
            worker.postMessage(message);
        },
        [terminate],
    );

    return { cancel, run, state };
}
