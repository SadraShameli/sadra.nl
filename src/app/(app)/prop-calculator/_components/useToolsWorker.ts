'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
    parseToolsResult,
    ToolsResponseKind,
    type ToolsWorkerRequest,
    type ToolsWorkerResult,
} from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';

export enum ToolsWorkerPhase {
    Cancelled = 'cancelled',
    Failed = 'failed',
    Idle = 'idle',
    Running = 'running',
    Succeeded = 'succeeded',
}

export interface ToolsWorker {
    readonly cancel: () => void;
    readonly run: (request: ToolsWorkerRequest) => void;
    readonly state: ToolsWorkerState;
}

export type ToolsWorkerState =
    | { readonly phase: ToolsWorkerPhase.Cancelled }
    | { readonly phase: ToolsWorkerPhase.Failed; readonly reason: string }
    | { readonly phase: ToolsWorkerPhase.Idle }
    | { readonly phase: ToolsWorkerPhase.Running }
    | { readonly phase: ToolsWorkerPhase.Succeeded; readonly result: ToolsWorkerResult };

const IDLE: ToolsWorkerState = { phase: ToolsWorkerPhase.Idle };
const WORKER_FAILURE_REASON = 'The tools worker failed.';

export function useToolsWorker(): ToolsWorker {
    const [state, setState] = useState<ToolsWorkerState>(IDLE);
    const workerReference = useRef<null | Worker>(null);
    const runIdReference = useRef<null | number>(null);

    const teardown = useCallback(() => {
        workerReference.current?.terminate();
        workerReference.current = null;
    }, []);

    useEffect(() => teardown, [teardown]);

    const cancel = useCallback(() => {
        runIdReference.current = null;
        teardown();
        setState((previous) =>
            previous.phase === ToolsWorkerPhase.Running
                ? { phase: ToolsWorkerPhase.Cancelled }
                : previous,
        );
    }, [teardown]);

    const run = useCallback(
        (request: ToolsWorkerRequest) => {
            teardown();
            const { runId } = request;
            runIdReference.current = runId;
            setState({ phase: ToolsWorkerPhase.Running });

            const worker = createToolsWorker();
            workerReference.current = worker;

            worker.addEventListener('message', (event: MessageEvent<unknown>) => {
                if (runIdReference.current !== runId) return;
                let result: ToolsWorkerResult;
                try {
                    result = parseToolsResult(event.data);
                } catch (error) {
                    teardown();
                    setState({
                        phase: ToolsWorkerPhase.Failed,
                        reason: error instanceof Error ? error.message : String(error),
                    });
                    return;
                }
                if (result.runId !== runId) return;
                teardown();
                if (result.kind === ToolsResponseKind.Failed) {
                    setState({ phase: ToolsWorkerPhase.Failed, reason: result.reason });
                    return;
                }
                setState({ phase: ToolsWorkerPhase.Succeeded, result });
            });
            worker.addEventListener('error', () => {
                if (runIdReference.current !== runId) return;
                teardown();
                setState({ phase: ToolsWorkerPhase.Failed, reason: WORKER_FAILURE_REASON });
            });
            worker.postMessage(request);
        },
        [teardown],
    );

    return { cancel, run, state };
}

function createToolsWorker(): Worker {
    return new Worker(new URL('../_workers/toolsWorker.ts', import.meta.url), {
        type: 'module',
    });
}
