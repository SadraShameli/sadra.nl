import { handleToolsMessage } from '~/app/(app)/prop-calculator/_workers/toolsWorker';
import {
    type LabScenarioResult,
    ToolsResponseKind,
    type ToolsWorkerResult,
} from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { fraction, LiveTransferContinuationKind } from '~/lib/prop-calculator';

type MessageListener = (event: MessageEvent<unknown>) => void;

export class InlineToolsWorker {
    static instances: InlineToolsWorker[] = [];
    private readonly listeners = new Map<string, MessageListener[]>();
    posted: unknown[] = [];
    terminated = false;

    constructor() {
        InlineToolsWorker.instances.push(this);
    }

    addEventListener(type: string, listener: MessageListener): void {
        const existing = this.listeners.get(type) ?? [];
        existing.push(listener);
        this.listeners.set(type, existing);
    }

    postMessage(message: unknown): void {
        this.posted.push(message);
        if (this.terminated) return;
        const data = handleToolsMessage(message);
        const messageListeners = this.listeners.get('message') ?? [];
        for (const listener of messageListeners) {
            listener({ data } as MessageEvent<unknown>);
        }
    }

    terminate(): void {
        this.terminated = true;
    }
}

export function labResultMessage(
    runId: number,
    expectedMonthlyNet = 100,
): ToolsWorkerResult {
    return {
        kind: ToolsResponseKind.Lab,
        result: labScenarioResult(expectedMonthlyNet),
        runId,
    };
}

export function labScenarioResult(expectedMonthlyNet = 100): LabScenarioResult {
    return {
        accountsLiveTransferDistribution: [1, 0],
        accountsPassDistribution: [0.5, 0.5],
        expectedAccountsPass: 0.5,
        expectedDaysToPass: 10,
        expectedMaxLossStreak: 3,
        expectedMonthlyNet,
        expectedMonthlyRealizedNet: expectedMonthlyNet,
        expectedNet: 200,
        lifetimeCapPoolingGap: null,
        liveTransferContinuation: LiveTransferContinuationKind.Off,
        liveTransferProbability: 0,
        meanTradesPerDay: 1,
        noTransferMonthlyNet: null,
        pAtLeast: { k1: 0.5, kAll: 0.5, kHalf: 0.5 },
        pAtLeastFundedSurvival: { k1: 0.4, kAll: 0.4, kHalf: 0.4 },
        perAccountFundedSurvival: 0.4,
        perAccountPass: 0.5,
        pHitDDLimit: 0.3,
        theoreticalPassProb: fraction(0.45),
        theoreticalPassReason: undefined,
    };
}
