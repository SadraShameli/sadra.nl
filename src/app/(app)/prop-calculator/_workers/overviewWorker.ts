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

type OverviewWorkerMessage = WorkerTaskMessage<
    OverviewWorkerResult,
    OverviewWorkerResult
>;

export function runOverviewTask(
    { request, runId }: WorkerTaskRequest<OverviewWorkerRequest>,
    post: (message: OverviewWorkerMessage) => void,
): void {
    try {
        const { requests } = overviewWorkerRequestSchema.parse(request);
        const outcomes: OverviewOutcome[] = [];
        for (const one of requests) {
            const outcome = overviewOutcomeOf(one);
            outcomes.push(outcome);
            if (outcomes.length < requests.length) {
                post({
                    kind: WorkerTaskEventKind.Progress,
                    progress: { outcomes: [outcome] },
                    runId,
                });
            }
        }
        post({ kind: WorkerTaskEventKind.Done, result: { outcomes }, runId });
    } catch (error) {
        post({
            kind: WorkerTaskEventKind.Failed,
            reason: error instanceof Error ? error.message : String(error),
            runId,
        });
    }
}

if (typeof self !== 'undefined' && 'addEventListener' in self) {
    self.addEventListener(
        'message',
        (event: MessageEvent<WorkerTaskRequest<OverviewWorkerRequest>>) => {
            runOverviewTask(event.data, (message) => {
                self.postMessage(message);
            });
        },
    );
}
