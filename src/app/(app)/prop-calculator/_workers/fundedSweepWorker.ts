/// <reference lib="webworker" />

import {
    fundedOptimizerSweep,
    fundedSweepPlan,
} from '../_components/fundedOptimizer/fundedOptimizerModel';
import { WorkerTaskEventKind, type WorkerTaskMessage, type WorkerTaskRequest } from '../_components/workerTaskState';
import { type FundedSweepRequest, type FundedSweepResult } from './fundedSweepWorkerMessages';

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
    (event: MessageEvent<WorkerTaskRequest<FundedSweepRequest>>) => {
        const { request, runId } = event.data;
        try {
            const plan = fundedSweepPlan(request);
            if (plan === null) {
                fail(
                    runId,
                    `fundedSweepWorker: no plan for firm "${request.firmId}" serial "${request.planSerial}"`,
                );
                return;
            }
            const result = fundedOptimizerSweep(plan, request);
            const message: WorkerTaskMessage<never, FundedSweepResult> = {
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
