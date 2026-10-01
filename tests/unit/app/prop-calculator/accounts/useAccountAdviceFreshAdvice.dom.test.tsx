import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ComputationCache } from '~/app/(app)/prop-calculator/_components/computationCache';
import { ComputationId } from '~/app/(app)/prop-calculator/_components/ComputationId';
import { ComputationCacheContext } from '~/app/(app)/prop-calculator/_components/useDebouncedSimulation';
import { WorkerTaskEventKind } from '~/app/(app)/prop-calculator/_components/workerTaskState';
import { advisorWorkerCacheKey } from '~/app/(app)/prop-calculator/_workers/advisorWorkerMessages';
import {
    AccountAdvicePhase,
    type AccountAdviceState,
    useAccountAdvice,
    type UseAccountAdviceInput,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/useAccountAdvice';
import { ApexVariant, findFirm, FirmId, newFundedCycleTracker } from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK, FundedSizingAdvisor } from '~/lib/prop-calculator/advisor';
import { TradingPhase } from '~/lib/prop-calculator/core';

function apexEod50k() {
    const plan = findFirm(FirmId.Apex)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (plan === undefined) throw new Error('no Apex EOD 50K plan');
    return plan;
}

const PLAN = apexEod50k();

class FakeWorker {
    static instances: FakeWorker[] = [];
    listeners = new Map<string, ((event: MessageEvent<unknown>) => void)[]>();

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

    postMessage(): void {
        return;
    }

    terminate(): void {
        return;
    }
}

function finishFirstRun() {
    act(() => {
        FakeWorker.instances[0]?.emit('message', {
            kind: WorkerTaskEventKind.Done,
            result: { outcomes: [] },
            runId: 1,
        });
    });
}

function fundedAdvisorInput(today: string): UseAccountAdviceInput {
    const state = {
        balance: 51_500,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
        intradayHighProfit: 0,
        peakDayCloseProfit: 0,
        peakIntradayProfit: 0,
        qualifyingDays: 20,
        startingBalance: 50_000,
        threshold: 48_000,
        thresholdLocked: false,
        todayPnL: 0,
        tradingDays: 20,
    };
    const tracker = newFundedCycleTracker({
        ...state,
        balance: state.startingBalance,
    });
    const advisor = new FundedSizingAdvisor({
        account: {
            assumptions: [],
            contractLimit: null,
            cushion: state.balance - state.threshold,
            fundedTracker: tracker,
            kind: TradingPhase.Funded,
            plan: PLAN,
            resolvedDailyLossLimit: null,
            state,
        },
        fundedHorizonDays: 252,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        today,
        trials: 20,
    });
    return {
        advisor,
        firmId: FirmId.Apex,
        optIns: { takesFundedReset: false, takesOneTimeEarlyWithdrawal: false },
        planSerial: 'apex-50000-eod',
    };
}

function Harness({
    frames,
    input,
}: {
    readonly frames: AccountAdviceState[];
    readonly input: UseAccountAdviceInput;
}) {
    frames.push(useAccountAdvice(input));
    return null;
}

describe('useAccountAdvice caches the engine outcome and assembles fresh advice (PT-34e)', () => {
    let root: Root;
    let container: HTMLElement;
    let sharedCache: ComputationCache;
    let frames: AccountAdviceState[];

    function render(input: UseAccountAdviceInput) {
        act(() => {
            root.render(
                <ComputationCacheContext.Provider value={sharedCache}>
                    <Harness frames={frames} input={input} />
                </ComputationCacheContext.Provider>,
            );
        });
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        FakeWorker.instances = [];
        vi.stubGlobal('Worker', FakeWorker);
        sharedCache = new ComputationCache();
        frames = [];
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
    });

    it('has advisors that share engine requests and still assemble different advice', () => {
        const first = fundedAdvisorInput('2026-09-26');
        const second = fundedAdvisorInput('2026-10-20');
        expect(first.advisor.optimumRequests()).toEqual(
            second.advisor.optimumRequests(),
        );
        expect(JSON.stringify(second.advisor.assemble([]))).not.toBe(
            JSON.stringify(first.advisor.assemble([])),
        );
    });

    it('never renders the first advisor advice for a second advisor with identical engine requests', () => {
        const first = fundedAdvisorInput('2026-09-26');
        const second = fundedAdvisorInput('2026-10-20');
        render(first);
        finishFirstRun();
        frames.length = 0;

        render(second);

        const fresh = JSON.stringify(second.advisor.assemble([]));
        const readyFrames = frames.filter(
            (frame) => frame.phase === AccountAdvicePhase.Ready,
        );
        expect(readyFrames.length).toBeGreaterThan(0);
        for (const frame of readyFrames) {
            expect(JSON.stringify(frame.advice)).toBe(fresh);
        }
        expect(FakeWorker.instances).toHaveLength(1);
    });

    it('caches only the worker outcome under the engine request key', () => {
        const input = fundedAdvisorInput('2026-09-26');
        render(input);
        finishFirstRun();

        const key = advisorWorkerCacheKey({
            firmId: input.firmId,
            optIns: input.optIns,
            planSerial: input.planSerial,
            requests: input.advisor.optimumRequests(),
        });
        expect(sharedCache.get(ComputationId.Advice, key)).toEqual({
            outcomes: [],
        });
    });
});
