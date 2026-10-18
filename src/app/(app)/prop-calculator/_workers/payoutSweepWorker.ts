/// <reference lib="webworker" />

import {
    planPayoutOutlook,
    reconstructPayoutPlannerAccount,
} from '~/app/(app)/prop-calculator/_components/payoutPlanner/payoutPlannerModel';
import {
    WorkerTaskEventKind,
    type WorkerTaskMessage,
    type WorkerTaskRequest,
} from '~/app/(app)/prop-calculator/_components/workerTaskState';
import { dollars } from '~/lib/prop-calculator';
import {
    AdviceSource,
    runPayoutSizeSweep,
} from '~/lib/prop-calculator/advisor';

import {
    payoutOutlookPlan,
    type PayoutOutlookRequest,
    type PayoutOutlookResult,
    payoutSweepPlan,
    type PayoutSweepRequest,
    type PayoutSweepResult,
} from './payoutSweepWorkerMessages';

type PayoutWorkerRequest = PayoutOutlookRequest | PayoutSweepRequest;
type PayoutWorkerResult = PayoutOutlookResult | PayoutSweepResult;

function fail(runId: number, reason: string): void {
    const message: WorkerTaskMessage<never, never> = {
        kind: WorkerTaskEventKind.Failed,
        reason,
        runId,
    };
    self.postMessage(message);
}

function isPayoutOutlookRequest(
    request: PayoutWorkerRequest,
): request is PayoutOutlookRequest {
    return 'isEligible' in request;
}

function runOutlook(request: PayoutOutlookRequest): PayoutOutlookResult {
    const plan = payoutOutlookPlan(request);
    if (plan === null) {
        throw new Error(
            `payoutSweepWorker: no plan for firm "${request.firmId}" serial "${request.planSerial}"`,
        );
    }
    const { account } = reconstructPayoutPlannerAccount({
        asOf: request.asOf,
        balance: dollars(request.balance),
        floorAtLastPayout:
            request.floorAtLastPayout === null
                ? null
                : dollars(request.floorAtLastPayout),
        lastPayoutOn: request.lastPayoutOn,
        payoutsTaken: request.payoutsTaken,
        peak: request.peak === null ? null : dollars(request.peak),
        plan,
        qualifyingDaysSinceLastPayout: request.qualifyingDaysSinceLastPayout,
        requestSize: dollars(request.requestSize),
        rulebook: request.spec.rulebook,
    });
    return planPayoutOutlook({
        account,
        isEligible: request.isEligible,
        spec: request.spec,
    });
}

function runSweep(request: PayoutSweepRequest): PayoutSweepResult {
    const plan = payoutSweepPlan(request);
    if (plan === null) {
        throw new Error(
            `payoutSweepWorker: no plan for firm "${request.firmId}" serial "${request.planSerial}"`,
        );
    }
    return runPayoutSizeSweep(plan, {
        personalOverrideRequest: request.personalOverrideRequest ?? null,
        source: AdviceSource.PayoutSizeSweep,
        spec: request.spec,
    });
}

self.addEventListener(
    'message',
    (event: MessageEvent<WorkerTaskRequest<PayoutWorkerRequest>>) => {
        const { request, runId } = event.data;
        try {
            const result: PayoutWorkerResult = isPayoutOutlookRequest(request)
                ? runOutlook(request)
                : runSweep(request);
            const message: WorkerTaskMessage<never, PayoutWorkerResult> = {
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
