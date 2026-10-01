/// <reference lib="webworker" />

import {
    WorkerTaskEventKind,
    type WorkerTaskMessage,
    type WorkerTaskRequest,
} from '~/app/(app)/prop-calculator/_components/workerTaskState';

import {
    type CopyGroupWorkerOutcome,
    type CopyGroupWorkerRequest,
    simulateGroupOutcomeOf,
} from './copyGroupWorkerMessages';

self.addEventListener(
    'message',
    (event: MessageEvent<WorkerTaskRequest<CopyGroupWorkerRequest>>) => {
        const { request, runId } = event.data;
        const message: WorkerTaskMessage<never, CopyGroupWorkerOutcome> = {
            kind: WorkerTaskEventKind.Done,
            result: simulateGroupOutcomeOf(request),
            runId,
        };
        self.postMessage(message);
    },
);
