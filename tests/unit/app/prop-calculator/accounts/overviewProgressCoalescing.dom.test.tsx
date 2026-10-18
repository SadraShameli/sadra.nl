import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkerTaskEventKind } from '~/app/(app)/prop-calculator/_components/workerTaskState';
import {
    overviewAccountRequestsFor,
    type OverviewOutcome,
    OverviewOutcomeKind,
    type OverviewRequest,
    overviewRequestKey,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import { type OverviewEngine } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { useOverviewWorker } from '~/app/(app)/prop-calculator/accounts/_components/overview/useOverviewWorker';
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

const REQUEST_COUNT = 10;
const MESSAGE_SPACING_MS = 20;
const COALESCING_WINDOW_MS = 400;

const workers: FakeWorker[] = [];

class FakeWorker extends EventTarget {
    runId = 0;

    constructor() {
        super();
        workers.push(this);
    }

    emit(data: unknown) {
        this.dispatchEvent(new MessageEvent('message', { data }));
    }

    postMessage(message: { runId: number }) {
        this.runId = message.runId;
    }

    terminate() {
        return;
    }
}

function failedOutcome(request: OverviewRequest): OverviewOutcome {
    return {
        key: overviewRequestKey(request),
        kind: OverviewOutcomeKind.Failed,
        reason: 'not run in this test',
    };
}

function sameGroupRequests(): readonly OverviewRequest[] {
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
        planSerial: `${request.planSerial}-${String(index)}`,
    }));
}

describe('the overview worker progress reaches the page coalesced', () => {
    let container: HTMLElement;
    let root: Root;
    let renders = 0;
    let latest: null | OverviewEngine = null;
    const requests = sameGroupRequests();

    function Probe() {
        renders += 1;
        latest = useOverviewWorker(requests);
        return null;
    }

    beforeEach(() => {
        vi.useFakeTimers({
            toFake: ['setTimeout', 'clearTimeout', 'performance'],
        });
        vi.stubGlobal('Worker', FakeWorker);
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        workers.length = 0;
        renders = 0;
        latest = null;
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('renders the page once per window for a burst of one-outcome progress messages and still shows every outcome', () => {
        act(() => {
            root.render(<Probe />);
        });
        act(() => {
            vi.advanceTimersByTime(0);
        });
        const [worker] = workers;
        if (worker === undefined) throw new Error('no worker started');
        expect(workers).toHaveLength(1);
        const rendersBeforeProgress = renders;
        for (const request of requests) {
            act(() => {
                worker.emit({
                    kind: WorkerTaskEventKind.Progress,
                    progress: { outcomes: [failedOutcome(request)] },
                    runId: worker.runId,
                });
                vi.advanceTimersByTime(MESSAGE_SPACING_MS);
            });
        }
        expect(renders - rendersBeforeProgress).toBeLessThanOrEqual(1);
        expect(latest?.outcomes.size).toBe(1);
        act(() => {
            vi.advanceTimersByTime(COALESCING_WINDOW_MS);
        });
        expect(renders - rendersBeforeProgress).toBeLessThanOrEqual(2);
        expect([...(latest?.outcomes.keys() ?? [])]).toEqual(
            requests.map((request) => overviewRequestKey(request)),
        );
    });

    it('drops the held progress once the run is done and shows the final outcomes', () => {
        act(() => {
            root.render(<Probe />);
        });
        act(() => {
            vi.advanceTimersByTime(0);
        });
        const [worker] = workers;
        if (worker === undefined) throw new Error('no worker started');
        const [first, second] = requests;
        if (first === undefined || second === undefined) {
            throw new Error('too few requests');
        }
        act(() => {
            worker.emit({
                kind: WorkerTaskEventKind.Progress,
                progress: { outcomes: [failedOutcome(first)] },
                runId: worker.runId,
            });
            worker.emit({
                kind: WorkerTaskEventKind.Progress,
                progress: { outcomes: [failedOutcome(second)] },
                runId: worker.runId,
            });
            worker.emit({
                kind: WorkerTaskEventKind.Done,
                result: { outcomes: requests.map((one) => failedOutcome(one)) },
                runId: worker.runId,
            });
        });
        const rendersAfterDone = renders;
        act(() => {
            vi.advanceTimersByTime(COALESCING_WINDOW_MS);
        });
        expect(renders).toBe(rendersAfterDone);
        expect(latest?.outcomes.size).toBe(REQUEST_COUNT);
    });
});
