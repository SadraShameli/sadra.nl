import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import {
    ComputationCache,
    initialFor,
} from '~/app/(app)/prop-calculator/_components/computationCache';
import { ComputationId } from '~/app/(app)/prop-calculator/_components/ComputationId';
import {
    type FundedOptimizerCalculatorInputs,
    fundedOptimizerRequest,
} from '~/app/(app)/prop-calculator/_components/fundedOptimizer/fundedOptimizerModel';
import { useFundedSweep } from '~/app/(app)/prop-calculator/_components/fundedOptimizer/useFundedSweep';
import { ComputationCacheContext } from '~/app/(app)/prop-calculator/_components/useDebouncedSimulation';
import {
    IDLE_WORKER_TASK,
    reduceWorkerTask,
    type WorkerTaskEvent,
    WorkerTaskEventKind,
    type WorkerTaskState,
} from '~/app/(app)/prop-calculator/_components/workerTaskState';
import {
    fundedSweepCacheKey,
    type FundedSweepRequest,
    type FundedSweepResult,
} from '~/app/(app)/prop-calculator/_workers/fundedSweepWorkerMessages';
import { findFirm, FirmId, serializePlanId } from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';
import { type Plan, TopStepVariant } from '~/lib/prop-calculator/core';
import {
    FundedCandidateBuildKind,
    FundedCandidateRefusal,
} from '~/lib/prop-calculator/optimize';

const fakeWorker = vi.hoisted(() => ({
    dispatch: null as
        ((event: WorkerTaskEvent<never, FundedSweepResult>) => void) | null,
    runId: 0,
    runSpy: vi.fn<(request: FundedSweepRequest) => void>(),
}));

vi.mock('~/app/(app)/prop-calculator/_components/useWorkerTask', async () => {
    const React = await import('react');
    return {
        useWorkerTask: () => {
            const [state, dispatch] = React.useReducer<
                WorkerTaskState<never, FundedSweepResult>,
                [WorkerTaskEvent<never, FundedSweepResult>]
            >(reduceWorkerTask, IDLE_WORKER_TASK);
            fakeWorker.dispatch = dispatch;
            const runIdReference = React.useRef(0);
            const run = React.useCallback((request: FundedSweepRequest) => {
                runIdReference.current += 1;
                fakeWorker.runId = runIdReference.current;
                fakeWorker.runSpy(request);
                dispatch({
                    kind: WorkerTaskEventKind.Start,
                    runId: runIdReference.current,
                });
            }, []);
            const cancel = React.useCallback(() => {
                dispatch({ kind: WorkerTaskEventKind.Cancel });
            }, []);
            return { cancel, run, state };
        },
    };
});

function requirePlan(value: null | Plan | undefined, message: string): Plan {
    if (value === null || value === undefined) throw new Error(message);
    return value;
}

const TOPSTEP_50K = requirePlan(
    findFirm(FirmId.TopStep)?.findPlanBySerial(
        serializePlanId({
            accountSize: 50_000,
            firm: FirmId.TopStep,
            variant: TopStepVariant.StandardStandard,
        }),
    ),
    'expected the TopStep 50K Standard/Standard plan to resolve',
);

function baseInputs(): FundedOptimizerCalculatorInputs {
    const state = defaultCalculatorState();
    return { ...state, plan: TOPSTEP_50K };
}

function buildRequest(
    overrides: Partial<FundedOptimizerCalculatorInputs> = {},
): FundedSweepRequest {
    return fundedOptimizerRequest(
        { ...baseInputs(), ...overrides },
        DEFAULT_RULEBOOK,
    );
}

function fakeResult(label: string): FundedSweepResult {
    return {
        kind: FundedCandidateBuildKind.Refused,
        refusal: {
            flatsBelowOneContract: [label.length],
            kind: FundedCandidateRefusal.NoCandidates,
        },
    };
}

function Harness({ request }: { request: FundedSweepRequest }) {
    useFundedSweep(request);
    return null;
}

describe('useFundedSweep resolves the funded-optimizer request/response race (PT-25b review)', () => {
    let root: Root;
    let container: HTMLElement;
    let cache: ComputationCache;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        cache = new ComputationCache();
        fakeWorker.dispatch = null;
        fakeWorker.runId = 0;
        fakeWorker.runSpy = vi.fn();
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        vi.clearAllMocks();
    });

    it('never caches a Done result for the previous request under the new request key', () => {
        const requestA = buildRequest();
        const requestB = buildRequest({ seed: requestA.base.seed + 1 });
        const keyA = fundedSweepCacheKey(requestA);
        const keyB = fundedSweepCacheKey(requestB);
        expect(keyA).not.toBe(keyB);

        act(() => {
            root.render(
                <ComputationCacheContext.Provider value={cache}>
                    <Harness request={requestA} />
                </ComputationCacheContext.Provider>,
            );
        });
        expect(fakeWorker.runSpy).toHaveBeenCalledTimes(1);

        const resultA = fakeResult('a');
        act(() => {
            fakeWorker.dispatch?.({
                kind: WorkerTaskEventKind.Done,
                result: resultA,
                runId: fakeWorker.runId,
            });
        });
        expect(initialFor(ComputationId.FundedOptimizer, keyA, cache)).toEqual({
            pending: false,
            result: resultA,
            shouldCompute: false,
        });

        act(() => {
            root.render(
                <ComputationCacheContext.Provider value={cache}>
                    <Harness request={requestB} />
                </ComputationCacheContext.Provider>,
            );
        });

        const afterKeyChange = initialFor(
            ComputationId.FundedOptimizer,
            keyB,
            cache,
        );
        expect(afterKeyChange.shouldCompute).toBe(true);
        expect(afterKeyChange.result).not.toBe(resultA);

        const resultB = fakeResult('bb');
        act(() => {
            fakeWorker.dispatch?.({
                kind: WorkerTaskEventKind.Done,
                result: resultB,
                runId: fakeWorker.runId,
            });
        });

        expect(initialFor(ComputationId.FundedOptimizer, keyB, cache)).toEqual({
            pending: false,
            result: resultB,
            shouldCompute: false,
        });
        expect(fakeWorker.runSpy).toHaveBeenCalledTimes(2);
    });
});
