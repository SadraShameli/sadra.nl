import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ComputationCache } from '~/app/(app)/prop-calculator/_components/computationCache';
import { ComputationId } from '~/app/(app)/prop-calculator/_components/ComputationId';
import { ComputationCacheContext } from '~/app/(app)/prop-calculator/_components/useDebouncedSimulation';
import { WorkerTaskEventKind } from '~/app/(app)/prop-calculator/_components/workerTaskState';
import {
    AdvisorRequestOutcomeKind,
    type AdvisorValueRequest,
    type AdvisorValueResult,
} from '~/app/(app)/prop-calculator/_workers/advisorWorkerMessages';
import {
    AccountAdvicePhase,
    type AccountAdviceState,
    AdviceValuesPhase,
    useAccountAdvice,
    type UseAccountAdviceInput,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/useAccountAdvice';
import {
    ApexVariant,
    findFirm,
    FirmId,
    newFundedCycleTracker,
} from '~/lib/prop-calculator';
import {
    AccountSubstate,
    AdviceSource,
    AdviceStalenessKind,
    DEFAULT_RULEBOOK,
    FundedSizingAdvisor,
    NO_PENDING_PAYOUT_COUNTS,
} from '~/lib/prop-calculator/advisor';
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

function fundedAdvisorInput(
    trials = 20,
    substate: AccountSubstate.Suspended | null = null,
    snapshotAsOf = '2026-09-26',
): UseAccountAdviceInput {
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
            ...NO_PENDING_PAYOUT_COUNTS,
        },
        fundedHorizonDays: 252,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf,
        substate,
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
        const latest: { current: AccountAdviceState | null } = {
            current: null,
        };
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

    it('starts no worker for a Suspended account and is ready at once with no sizing and no payout advice (PT-19h, F-118)', () => {
        const latest: { current: AccountAdviceState | null } = {
            current: null,
        };

        renderHarness(
            root,
            fundedAdvisorInput(20, AccountSubstate.Suspended),
            latest,
        );

        expect(FakeWorker.instances).toHaveLength(0);
        if (latest.current?.phase !== AccountAdvicePhase.Ready) {
            throw new Error('expected a ready state');
        }
        const { advice } = latest.current;
        expect(advice.documented).toBeNull();
        expect(advice.payoutAdvice).toBeNull();
        expect(advice.requests).toEqual([]);
    });

    it('caches a computed advice through the shared ComputationCache under ComputationId.Advice', () => {
        const setSpy = vi.spyOn(ComputationCache.prototype, 'set');
        const getSpy = vi.spyOn(ComputationCache.prototype, 'get');
        const input = fundedAdvisorInput();
        const latest: { current: AccountAdviceState | null } = {
            current: null,
        };
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
        const latest: { current: AccountAdviceState | null } = {
            current: null,
        };

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
                <RecordingHarness
                    frames={frames}
                    input={fundedAdvisorInput(20)}
                />,
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
                <RecordingHarness
                    frames={frames}
                    input={fundedAdvisorInput(21)}
                />,
            );
        });

        expect(frames.map((frame) => frame.phase)).not.toContain(
            AccountAdvicePhase.Failed,
        );
    });
});

function valueRequest(risk: number): AdvisorValueRequest {
    const { advisor } = fundedAdvisorInput();
    const [fresh] = advisor.optimumRequests();
    if (fresh?.source !== AdviceSource.FundedSweepFresh) {
        throw new Error('expected a FundedSweepFresh request');
    }
    return {
        candidateRiskGrid: [risk],
        payoutStake: null,
        rr: 2,
        rungs: [{ risk, rr: 2 }],
        spec: {
            enginePolicy: fresh.policy,
            rulebook: DEFAULT_RULEBOOK,
            run: { maxEvalDays: 40, seed: 5, trials: 20 },
        },
        start: {
            phase: TradingPhase.Eval,
            state: {
                balance: 51_000,
                bestDayProfit: 0,
                consecutiveIdleDays: 0,
                elapsedDays: 3,
                intradayHighProfit: 0,
                peakDayCloseProfit: 0,
                peakIntradayProfit: 0,
                qualifyingDays: 3,
                startingBalance: 50_000,
                threshold: 48_000,
                thresholdLocked: false,
                todayPnL: 0,
                tradingDays: 3,
            },
        },
    };
}

const FAILED_VALUES: AdvisorValueResult = {
    candidates: { kind: AdvisorRequestOutcomeKind.Failed, reason: 'x' },
    now: { kind: AdvisorRequestOutcomeKind.Failed, reason: 'x' },
    payoutStake: null,
    swings: [],
};

function finishEngine() {
    act(() => {
        FakeWorker.instances[0]?.emit('message', {
            kind: WorkerTaskEventKind.Done,
            result: { outcomes: [] },
            runId: 1,
        });
    });
}

function finishValues(result?: unknown) {
    act(() => {
        FakeWorker.instances[1]?.emit('message', {
            kind: WorkerTaskEventKind.Done,
            result: result ?? { outcomes: [], values: FAILED_VALUES },
            runId: 1,
        });
    });
}

function postedRequest(index: number) {
    return (
        FakeWorker.instances[index]?.posted[0] as {
            request: { requests: unknown[]; values?: AdvisorValueRequest };
        }
    ).request;
}

describe('useAccountAdvice value requests (PT-67)', () => {
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

    it('runs the value request in its own worker run, apart from the engine requests', () => {
        const values = valueRequest(500);
        const latest: { current: AccountAdviceState | null } = {
            current: null,
        };

        renderHarness(root, { ...fundedAdvisorInput(), values }, latest);

        expect(FakeWorker.instances).toHaveLength(2);
        expect(postedRequest(0).values).toBeUndefined();
        expect(postedRequest(0).requests.length).toBeGreaterThan(0);
        expect(postedRequest(1).values).toEqual(values);
        expect(postedRequest(1).requests).toEqual([]);
    });

    it('is ready once the engine run is done, with the value views still computing', () => {
        const latest: { current: AccountAdviceState | null } = {
            current: null,
        };
        renderHarness(
            root,
            { ...fundedAdvisorInput(), values: valueRequest(500) },
            latest,
        );

        finishEngine();

        expect(latest.current?.phase).toBe(AccountAdvicePhase.Ready);
        if (latest.current?.phase !== AccountAdvicePhase.Ready) return;
        expect(latest.current.values.phase).toBe(AdviceValuesPhase.Loading);
    });

    it('exposes the value outcome from the value run on the ready state', () => {
        const latest: { current: AccountAdviceState | null } = {
            current: null,
        };
        renderHarness(
            root,
            { ...fundedAdvisorInput(), values: valueRequest(500) },
            latest,
        );

        finishEngine();
        finishValues();

        if (latest.current?.phase !== AccountAdvicePhase.Ready) {
            throw new Error('expected a ready state');
        }
        expect(latest.current.values).toEqual({
            phase: AdviceValuesPhase.Ready,
            result: FAILED_VALUES,
        });
    });

    it('starts no value worker for a Suspended advisor even when a value request is passed, and keeps the value state idle (PT-19h review)', () => {
        const latest: { current: AccountAdviceState | null } = {
            current: null,
        };

        renderHarness(
            root,
            {
                ...fundedAdvisorInput(20, AccountSubstate.Suspended),
                values: valueRequest(500),
            },
            latest,
        );

        expect(FakeWorker.instances).toHaveLength(0);
        if (latest.current?.phase !== AccountAdvicePhase.Ready) {
            throw new Error('expected a ready state');
        }
        expect(latest.current.values).toEqual({
            phase: AdviceValuesPhase.Idle,
        });
    });

    it('has an idle value state and no value worker when none was requested', () => {
        const latest: { current: AccountAdviceState | null } = {
            current: null,
        };
        renderHarness(root, fundedAdvisorInput(), latest);

        finishEngine();

        expect(FakeWorker.instances).toHaveLength(1);
        if (latest.current?.phase !== AccountAdvicePhase.Ready) {
            throw new Error('expected a ready state');
        }
        expect(latest.current.values).toEqual({
            phase: AdviceValuesPhase.Idle,
        });
    });

    it('carries the reason when the value request could not be built, with no value worker', () => {
        const latest: { current: AccountAdviceState | null } = {
            current: null,
        };
        renderHarness(
            root,
            {
                ...fundedAdvisorInput(),
                valuesUnavailableReason:
                    'a funded account needs its funded cycle tracker',
            },
            latest,
        );

        finishEngine();

        expect(FakeWorker.instances).toHaveLength(1);
        if (latest.current?.phase !== AccountAdvicePhase.Ready) {
            throw new Error('expected a ready state');
        }
        expect(latest.current.values).toEqual({
            phase: AdviceValuesPhase.Unavailable,
            reason: 'a funded account needs its funded cycle tracker',
        });
    });

    it('runs only the value worker again when only the value request changes, keeping the advice ready', () => {
        const latest: { current: AccountAdviceState | null } = {
            current: null,
        };
        renderHarness(
            root,
            { ...fundedAdvisorInput(), values: valueRequest(500) },
            latest,
        );
        finishEngine();
        finishValues();

        renderHarness(
            root,
            { ...fundedAdvisorInput(), values: valueRequest(750) },
            latest,
        );

        expect(FakeWorker.instances).toHaveLength(3);
        expect(postedRequest(2).values?.rungs[0]?.risk).toBe(750);
        expect(latest.current?.phase).toBe(AccountAdvicePhase.Ready);
        if (latest.current?.phase !== AccountAdvicePhase.Ready) return;
        expect(latest.current.values.phase).toBe(AdviceValuesPhase.Loading);
    });

    it('keeps the advice when the value run fails, and retries only the value worker', () => {
        const latest: { current: AccountAdviceState | null } = {
            current: null,
        };
        renderHarness(
            root,
            { ...fundedAdvisorInput(), values: valueRequest(500) },
            latest,
        );
        finishEngine();

        act(() => {
            FakeWorker.instances[1]?.emit('message', {
                kind: WorkerTaskEventKind.Failed,
                reason: 'the value run crashed',
                runId: 1,
            });
        });

        if (latest.current?.phase !== AccountAdvicePhase.Ready) {
            throw new Error('expected a ready state');
        }
        const { values } = latest.current;
        expect(values.phase).toBe(AdviceValuesPhase.Failed);
        if (values.phase !== AdviceValuesPhase.Failed) return;
        expect(values.reason).toBe('the value run crashed');

        act(() => {
            values.retry();
        });

        expect(FakeWorker.instances).toHaveLength(3);
        expect(postedRequest(2).values).toBeDefined();
    });

    it('fails the value state when the value run returns no value outcome', () => {
        const latest: { current: AccountAdviceState | null } = {
            current: null,
        };
        renderHarness(
            root,
            { ...fundedAdvisorInput(), values: valueRequest(500) },
            latest,
        );
        finishEngine();

        finishValues({ outcomes: [] });

        if (latest.current?.phase !== AccountAdvicePhase.Ready) {
            throw new Error('expected a ready state');
        }
        expect(latest.current.values.phase).toBe(AdviceValuesPhase.Failed);
    });
});

describe('useAccountAdvice runs no engine request for stale advice (PT-108 step 11, F-141)', () => {
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

    it('never starts a worker for a stale snapshot and is ready at once with the stale advice', () => {
        const latest: { current: AccountAdviceState | null } = {
            current: null,
        };

        renderHarness(root, fundedAdvisorInput(20, null, '2026-01-01'), latest);

        expect(FakeWorker.instances).toHaveLength(0);
        if (latest.current?.phase !== AccountAdvicePhase.Ready) {
            throw new Error('expected a ready state');
        }
        const { advice } = latest.current;
        expect(advice.staleness.kind).toBe(AdviceStalenessKind.Stale);
        expect(advice.requests).toEqual([]);
        expect(latest.current.failedOptima).toEqual([]);
    });

    it('starts no value worker for a stale snapshot either, even when a value request is passed', () => {
        const latest: { current: AccountAdviceState | null } = {
            current: null,
        };

        renderHarness(
            root,
            {
                ...fundedAdvisorInput(20, null, '2026-01-01'),
                values: valueRequest(500),
            },
            latest,
        );

        expect(FakeWorker.instances).toHaveLength(0);
        if (latest.current?.phase !== AccountAdvicePhase.Ready) {
            throw new Error('expected a ready state');
        }
        expect(latest.current.values.phase).toBe(AdviceValuesPhase.Idle);
    });

    it('still runs the engine for a fresh snapshot', () => {
        const latest: { current: AccountAdviceState | null } = {
            current: null,
        };

        renderHarness(root, fundedAdvisorInput(), latest);

        expect(FakeWorker.instances).toHaveLength(1);
    });

    it('starts the worker once a stale account gets a fresh snapshot', () => {
        const latest: { current: AccountAdviceState | null } = {
            current: null,
        };
        renderHarness(root, fundedAdvisorInput(20, null, '2026-01-01'), latest);
        expect(FakeWorker.instances).toHaveLength(0);

        renderHarness(root, fundedAdvisorInput(), latest);

        expect(FakeWorker.instances).toHaveLength(1);
    });
});
