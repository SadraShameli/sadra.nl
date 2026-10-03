import {
    ToolsRequestKind,
    ToolsResponseKind,
    type ToolsWorkerRequest,
    type ToolsWorkerResult,
} from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { dollars, FirmId, fraction } from '~/lib/prop-calculator';
import {
    LifetimePayoutCapBasis,
    RebuyLagBasis,
} from '~/lib/prop-calculator/advisor';

export class FakeWorker {
    static instances: FakeWorker[] = [];
    listeners = new Map<string, ((event: MessageEvent<unknown>) => void)[]>();
    posted: unknown[] = [];
    terminated = false;

    constructor() {
        FakeWorker.instances.push(this);
    }

    addEventListener(
        type: string,
        listener: (event: MessageEvent<unknown>) => void,
    ): void {
        const existing = this.listeners.get(type) ?? [];
        existing.push(listener);
        this.listeners.set(type, existing);
    }

    emit(type: string, data: unknown): void {
        const listeners = this.listeners.get(type) ?? [];
        for (const listener of listeners) {
            listener({ data } as MessageEvent<unknown>);
        }
    }

    postMessage(message: unknown): void {
        this.posted.push(message);
    }

    terminate(): void {
        this.terminated = true;
    }
}

export function projectionRequest(runId: number): ToolsWorkerRequest {
    return {
        bankroll: {
            maxConcurrentAccounts: null,
            monthlyBudget: null,
            payoutLagDays: 0,
            reinvestFraction: fraction(1),
            roundBudget: null,
            startingBankroll: dollars(5000),
        },
        dayBudget: 30,
        kind: ToolsRequestKind.Projection,
        runId,
        variant: {
            base: {
                fundedHorizonDays: 30,
                maxEvalDays: 30,
                riskPerTrade: 250,
                rrRatio: 2,
                seed: 1,
                tradesPerDay: 1,
                trials: 300,
                winrate: 0.4,
            },
            plan: {
                firmId: FirmId.TopStep,
                optIns: {
                    takesFundedReset: false,
                    takesOneTimeEarlyWithdrawal: false,
                },
                planSerial: 'topstep-50000-standard-standard',
            },
            policy: {
                commissionPerRoundTrip: 0,
                fundedHorizonDays: 30,
                lifetimePayoutCapBasis:
                    LifetimePayoutCapBasis.LiveTriggersNotChecked,
                lifetimePayoutCapOverride: null,
                payoutRequestOverride: 500,
                rebuyLagBasis: RebuyLagBasis.AssumedZero,
                rebuyLagDays: 0,
                retainedCushionRequest: 2000,
            },
        },
    };
}

export function projectionResult(runId: number): ToolsWorkerResult {
    return {
        kind: ToolsResponseKind.Projection,
        monthEnds: [],
        result: {
            cardsBoughtP50: 1,
            cashP10: [5000],
            cashP50: [5000],
            cashP90: [5000],
            cumulativeSpendP10: [0],
            cumulativeSpendP50: [0],
            cumulativeSpendP90: [0],
            days: [0],
            measuredCycleDays: null,
            pathRuin: fraction(0),
            payoutP10: [0],
            payoutP50: [0],
            payoutP90: [0],
            pFinalNetNegative: fraction(0),
            withdrawnP10: [0],
            withdrawnP50: [0],
            withdrawnP90: [0],
        },
        runId,
    };
}
