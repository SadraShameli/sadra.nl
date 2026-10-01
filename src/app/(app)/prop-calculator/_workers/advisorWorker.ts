/// <reference lib="webworker" />

import {
    WorkerTaskEventKind,
    type WorkerTaskMessage,
    type WorkerTaskRequest,
} from '~/app/(app)/prop-calculator/_components/workerTaskState';
import { findFirm, withPlanOptIns } from '~/lib/prop-calculator';

import {
    advisorRequestOutcomeOf,
    advisorValueOutcomeOf,
    type AdvisorWorkerRequest,
    type AdvisorWorkerResult,
} from './advisorWorkerMessages';

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
    (event: MessageEvent<WorkerTaskRequest<AdvisorWorkerRequest>>) => {
        const { request, runId } = event.data;
        try {
            const basePlan =
                findFirm(request.firmId)?.findPlanBySerial(
                    request.planSerial,
                ) ?? null;
            if (basePlan === null) {
                fail(
                    runId,
                    `advisorWorker: no plan for firm "${request.firmId}" serial "${request.planSerial}"`,
                );
                return;
            }
            const plan = withPlanOptIns(basePlan, request.optIns);
            const result: AdvisorWorkerResult = {
                outcomes: request.requests.map((one) =>
                    advisorRequestOutcomeOf(plan, one),
                ),
                values:
                    request.values === undefined
                        ? undefined
                        : advisorValueOutcomeOf(plan, request.values),
            };
            const message: WorkerTaskMessage<never, AdvisorWorkerResult> = {
                kind: WorkerTaskEventKind.Done,
                result,
                runId,
            };
            self.postMessage(message);
        } catch (error) {
            fail(runId, error instanceof Error ? error.message : String(error));
        }
    },
);
