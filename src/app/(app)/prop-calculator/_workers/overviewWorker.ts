/// <reference lib="webworker" />

import {
    WorkerTaskEventKind,
    type WorkerTaskMessage,
    type WorkerTaskRequest,
} from '~/app/(app)/prop-calculator/_components/workerTaskState';

import {
    type OverviewOutcome,
    overviewOutcomeOf,
    type OverviewWorkerRequest,
    overviewWorkerRequestSchema,
    type OverviewWorkerResult,
} from './overviewWorkerMessages';

function fail(runId: number, reason: string): void {
    const message: WorkerTaskMessage<never, never> = {
        kind: WorkerTaskEventKind.Failed,
        reason,
        runId,
    };
    self.postMessage(message);
}

self.addEventListener(
    'message',
    (event: MessageEvent<WorkerTaskRequest<OverviewWorkerRequest>>) => {
        const { request, runId } = event.data;
        try {
            const { requests } = overviewWorkerRequestSchema.parse(request);
            const outcomes: OverviewOutcome[] = [];
            for (const one of requests) {
                outcomes.push(overviewOutcomeOf(one));
                const progress: WorkerTaskMessage<OverviewWorkerResult, never> =
                    {
                        kind: WorkerTaskEventKind.Progress,
                        progress: { outcomes: [...outcomes] },
                        runId,
                    };
                self.postMessage(progress);
            }
            const done: WorkerTaskMessage<never, OverviewWorkerResult> = {
                kind: WorkerTaskEventKind.Done,
                result: { outcomes },
                runId,
            };
            self.postMessage(done);
        } catch (error) {
            fail(runId, error instanceof Error ? error.message : String(error));
        }
    },
);
