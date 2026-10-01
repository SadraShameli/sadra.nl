import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ComputationCache } from '~/app/(app)/prop-calculator/_components/computationCache';
import { ComputationId } from '~/app/(app)/prop-calculator/_components/ComputationId';
import { ComputationCacheContext } from '~/app/(app)/prop-calculator/_components/useDebouncedSimulation';
import { WorkerTaskEventKind } from '~/app/(app)/prop-calculator/_components/workerTaskState';
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

function fundedAdvisorInput(trials = 20): UseAccountAdviceInput {
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
    const tracker = newFundedCycleTracker({ ...state, balance: state.startingBalance });
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
        today: '2026-09-26',
        trials,
    });
    return {
        advisor,
        firmId: FirmId.Apex,
        optIns: { takesFundedReset: false, takesOneTimeEarlyWithdrawal: false },
        planSerial: 'apex-50000-eod',
    };
}

function Harness({
    input,
    latest,
}: {
    readonly input: null | UseAccountAdviceInput;
    readonly latest: { current: AccountAdviceState | null };
}) {
    latest.current = useAccountAdvice(input);
    return null;
}

function RecordingHarness({
    frames,
    input,
}: {
    readonly frames: AccountAdviceState[];
    readonly input: null | UseAccountAdviceInput;
}) {
    frames.push(useAccountAdvice(input));
    return null;
}

function renderHarness(
    root: Root,
    input: null | UseAccountAdviceInput,
    latest: { current: AccountAdviceState | null },
): void {
    act(() => {
        root.render(<Harness input={input} latest={latest} />);
    });
}

describe('useAccountAdvice (PT-34b)', () => {
    let root: Root;
    let container: HTMLElement;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        FakeWorker.instances = [];
        vi.stubGlobal('Worker', FakeWorker);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('retries the worker exactly once more after a failed run', () => {
        const input = fundedAdvisorInput();
        const latest: { current: AccountAdviceState | null } = { current: null };
        renderHarness(root, input, latest);
        expect(FakeWorker.instances).toHaveLength(1);

        act(() => {
            FakeWorker.instances[0]?.emit('message', {
                kind: WorkerTaskEventKind.Failed,
                reason: 'the engine refused these inputs',
                runId: 1,
            });
        });
        expect(latest.current?.phase).toBe(AccountAdvicePhase.Failed);
        if (latest.current?.phase !== AccountAdvicePhase.Failed) {
            throw new Error('expected a failed state');
        }
        const { retry } = latest.current;

        act(() => {
            retry();
        });

        expect(FakeWorker.instances).toHaveLength(2);
    });

    it('caches a computed advice through the shared ComputationCache under ComputationId.Advice', () => {
        const setSpy = vi.spyOn(ComputationCache.prototype, 'set');
        const getSpy = vi.spyOn(ComputationCache.prototype, 'get');
        const input = fundedAdvisorInput();
        const latest: { current: AccountAdviceState | null } = { current: null };
        renderHarness(root, input, latest);

        act(() => {
            FakeWorker.instances[0]?.emit('message', {
                kind: WorkerTaskEventKind.Done,
                result: { outcomes: [] },
                runId: 1,
            });
        });

        expect(latest.current?.phase).toBe(AccountAdvicePhase.Ready);
        expect(setSpy).toHaveBeenCalledWith(
            ComputationId.Advice,
            expect.any(String),
            expect.anything(),
        );
        expect(getSpy).toHaveBeenCalledWith(
            ComputationId.Advice,
            expect.any(String),
        );
    });

    it('reuses a cached advice across an unmount and remount when a ComputationCacheContext is provided (PT-34b)', () => {
        const sharedCache = new ComputationCache();
        const input = fundedAdvisorInput();
        const latest: { current: AccountAdviceState | null } = { current: null };

        function renderWithSharedCache() {
            act(() => {
                root.render(
                    <ComputationCacheContext.Provider value={sharedCache}>
                        <Harness input={input} latest={latest} />
                    </ComputationCacheContext.Provider>,
                );
            });
        }

        renderWithSharedCache();
        expect(FakeWorker.instances).toHaveLength(1);

        act(() => {
            FakeWorker.instances[0]?.emit('message', {
                kind: WorkerTaskEventKind.Done,
                result: { outcomes: [] },
                runId: 1,
            });
        });
        expect(latest.current?.phase).toBe(AccountAdvicePhase.Ready);

        act(() => root.unmount());
        root = createRoot(container);
        latest.current = null as AccountAdviceState | null;
        renderWithSharedCache();

        expect(latest.current?.phase).toBe(AccountAdvicePhase.Ready);
        expect(FakeWorker.instances).toHaveLength(1);
    });

    it('never renders the previous run results for an advisor whose engine requests changed', () => {
        const frames: AccountAdviceState[] = [];
        const first = fundedAdvisorInput(20);
        const second = fundedAdvisorInput(21);
        expect(JSON.stringify(first.advisor.optimumRequests())).not.toBe(
            JSON.stringify(second.advisor.optimumRequests()),
        );
        act(() => {
            root.render(<RecordingHarness frames={frames} input={first} />);
        });
        act(() => {
            FakeWorker.instances[0]?.emit('message', {
                kind: WorkerTaskEventKind.Done,
                result: { outcomes: [] },
                runId: 1,
            });
        });
        expect(frames.at(-1)?.phase).toBe(AccountAdvicePhase.Ready);

        frames.length = 0;
        act(() => {
            root.render(<RecordingHarness frames={frames} input={second} />);
        });

        expect(frames.length).toBeGreaterThan(0);
        expect(frames.map((frame) => frame.phase)).not.toContain(
            AccountAdvicePhase.Ready,
        );
        expect(FakeWorker.instances).toHaveLength(2);
    });

    it('never renders the previous run failure for an advisor whose engine requests changed', () => {
        const frames: AccountAdviceState[] = [];
        act(() => {
            root.render(
                <RecordingHarness frames={frames} input={fundedAdvisorInput(20)} />,
            );
        });
        act(() => {
            FakeWorker.instances[0]?.emit('message', {
                kind: WorkerTaskEventKind.Failed,
                reason: 'the engine refused these inputs',
                runId: 1,
            });
        });
        expect(frames.at(-1)?.phase).toBe(AccountAdvicePhase.Failed);

        frames.length = 0;
        act(() => {
            root.render(
                <RecordingHarness frames={frames} input={fundedAdvisorInput(21)} />,
            );
        });

        expect(frames.map((frame) => frame.phase)).not.toContain(
            AccountAdvicePhase.Failed,
        );
    });
});
