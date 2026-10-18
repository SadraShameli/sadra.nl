import { describe, expect, it } from 'vitest';

import {
    WorkerTaskEventKind,
    type WorkerTaskMessage,
} from '~/app/(app)/prop-calculator/_components/workerTaskState';
import { runOverviewTask } from '~/app/(app)/prop-calculator/_workers/overviewWorker';
import {
    mergeOverviewProgress,
    overviewAccountRequestsFor,
    type OverviewRequest,
    overviewRequestKey,
    type OverviewWorkerResult,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import {
    dollars,
    findFirm,
    FirmId,
    MffuVariant,
    NO_PLAN_OPT_INS,
    serializePlanId,
} from '~/lib/prop-calculator';
import {
    DashboardBalanceConvention,
    DEFAULT_RULEBOOK,
    NO_PENDING_PAYOUT_COUNTS,
    SizingStage,
} from '~/lib/prop-calculator/advisor';

const REQUEST_COUNT = 4;

function postedFor(
    requests: readonly OverviewRequest[],
): WorkerTaskMessage<OverviewWorkerResult, OverviewWorkerResult>[] {
    const posted: WorkerTaskMessage<
        OverviewWorkerResult,
        OverviewWorkerResult
    >[] = [];
    runOverviewTask({ request: { requests }, runId: 3 }, (message) => {
        posted.push(message);
    });
    return posted;
}

function unknownPlanRequests(): readonly OverviewRequest[] {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Pro,
    });
    if (plan === undefined) throw new Error('no MFF Pro 50K plan');
    const [request] = overviewAccountRequestsFor(
        [
            {
                account: {
                    asOf: '2026-09-26',
                    balance: dollars(55_000),
                    dashboardConvention: DashboardBalanceConvention.Nominal,
                    highestEodBalance: dollars(55_000),
                    highestIntradayBalance: dollars(55_000),
                    pendingPayouts: dollars(0),
                    stage: SizingStage.Funded,
                },
                firmId: plan.id.firm,
                measuredRebuyLag: null,
                optIns: NO_PLAN_OPT_INS,
                pendingPayoutCounts: NO_PENDING_PAYOUT_COUNTS,
                planSerial: serializePlanId(plan.id),
            },
        ],
        DEFAULT_RULEBOOK,
    );
    if (request === undefined) throw new Error('no account request');
    return Array.from({ length: REQUEST_COUNT }, (_, index) => ({
        ...request,
        planSerial: `unknown-${String(index)}`,
    }));
}

describe('the overview worker posts only what changed', () => {
    const requests = unknownPlanRequests();
    const keys = requests.map((request) => overviewRequestKey(request));

    it('posts one new outcome per progress message and no progress for the last one', () => {
        const progress = postedFor(requests).flatMap((message) =>
            message.kind === WorkerTaskEventKind.Progress
                ? [message.progress.outcomes.map((outcome) => outcome.key)]
                : [],
        );
        expect(progress).toEqual(keys.slice(0, -1).map((key) => [key]));
    });

    it('ends with every outcome in the done message', () => {
        const last = postedFor(requests).at(-1);
        expect(last?.kind).toBe(WorkerTaskEventKind.Done);
        expect(
            last?.kind === WorkerTaskEventKind.Done
                ? last.result.outcomes.map((outcome) => outcome.key)
                : [],
        ).toEqual(keys);
    });

    it('rebuilds the outcomes so far by merging the progress messages in order', () => {
        let held: null | OverviewWorkerResult = null;
        for (const message of postedFor(requests)) {
            if (message.kind === WorkerTaskEventKind.Progress) {
                held = mergeOverviewProgress(held, message.progress);
            }
        }
        expect(held?.outcomes.map((outcome) => outcome.key)).toEqual(
            keys.slice(0, -1),
        );
    });
});
