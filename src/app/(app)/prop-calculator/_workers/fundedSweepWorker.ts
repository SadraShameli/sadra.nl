/// <reference lib="webworker" />

import {
    fundedOptimizerSweep,
    fundedSweepPlan,
} from '~/app/(app)/prop-calculator/_components/fundedOptimizer/fundedOptimizerModel';
import {
    WorkerTaskEventKind,
    type WorkerTaskMessage,
    type WorkerTaskRequest,
} from '~/app/(app)/prop-calculator/_components/workerTaskState';

import {
    type FundedSweepProgress,
    type FundedSweepRequest,
    type FundedSweepResult,
} from './fundedSweepWorkerMessages';

type FundedSweepMessage = WorkerTaskMessage<
    FundedSweepProgress,
    FundedSweepResult
>;

export function runFundedSweepTask(
    { request, runId }: WorkerTaskRequest<FundedSweepRequest>,
    post: (message: FundedSweepMessage) => void,
): void {
    try {
        const plan = fundedSweepPlan(request);
        if (plan === null) {
            post({
                kind: WorkerTaskEventKind.Failed,
                reason: `fundedSweepWorker: no plan for firm "${request.firmId}" serial "${request.planSerial}"`,
                runId,
            });
            return;
        }
        const result = fundedOptimizerSweep(plan, request, (progress) => {
            post({ kind: WorkerTaskEventKind.Progress, progress, runId });
        });
        post({ kind: WorkerTaskEventKind.Done, result, runId });
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
        (event: MessageEvent<WorkerTaskRequest<FundedSweepRequest>>) => {
            runFundedSweepTask(event.data, (message) => {
                self.postMessage(message);
            });
        },
    );
}
