import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { ComputationCache } from '~/app/(app)/prop-calculator/_components/computationCache';
import { type LabScenario } from '~/app/(app)/prop-calculator/_components/types';
import { ComputationCacheContext } from '~/app/(app)/prop-calculator/_components/useDebouncedSimulation';
import { useLabSimulation } from '~/app/(app)/prop-calculator/_components/useLabSimulation';
import { ToolsResponseKind } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import {
    CorrelationMode,
    DayStopRuleKind,
    InstrumentSymbol,
    type MultiAccountResult,
    simulatePortfolio,
} from '~/lib/prop-calculator';

import { labResultMessage } from './labWorkerFixtures';
import { FakeWorker } from './toolsWorkerFixtures';

vi.mock(import('~/lib/prop-calculator'), async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        simulatePortfolio: vi.fn(() => ({}) as unknown as MultiAccountResult),
    };
});

const DEBOUNCE_MS = 600;
const plan = defaultCalculatorState().plan;

const scenarioOne: LabScenario = {
    accounts: 1,
    correlation: CorrelationMode.Copy,
    dayStop: { kind: DayStopRuleKind.None },
    groups: 1,
    id: 'one',
    instrument: null,
    label: 'One',
    riskPerTrade: 250,
    rrRatio: 2,
    stopPoints: null,
    tradesPerDay: 1,
    winrate: 0.55,
};

const scenarioTwo: LabScenario = {
    ...scenarioOne,
    id: 'two',
    label: 'Two',
    winrate: 0.6,
};

interface HarnessProperties {
    liveTransferHazard?: number;
    scenarios: LabScenario[];
    seed?: number;
}

type LabHandle = ReturnType<typeof useLabSimulation>;

interface PostedRequest {
    kind: string;
    run: { liveTransferHazard?: number; seed: number };
    runId: number;
    scenario: { winrate: number };
}

function advanceDebounce() {
    act(() => {
        vi.advanceTimersByTime(DEBOUNCE_MS);
    });
}

function Harness({
    latest,
    liveTransferHazard,
    scenarios,
    seed = 1,
}: HarnessProperties & { latest: { current: LabHandle | null } }) {
    latest.current = useLabSimulation({
        commissionPerRoundTrip: 0,
        fundedHorizonDays: 60,
        liveTransferHazard,
        maxEvalDays: 30,
        plan,
        scenarios,
        seed,
    });
    return null;
}

function requestsOf(worker: FakeWorker | undefined): PostedRequest[] {
    return (worker?.posted ?? []) as PostedRequest[];
}

function respond(worker: FakeWorker | undefined, index: number, net = 100) {
    const request = requestsOf(worker)[index];
    if (request === undefined) throw new Error(`no request ${index}`);
    act(() => {
        worker?.emit('message', labResultMessage(request.runId, net));
    });
}

describe('useLabSimulation runs every scenario in the tools worker (PT-73e)', () => {
    let container: HTMLDivElement;
    let root: Root;
    let latest: { current: LabHandle | null };

    function render(
        properties: HarnessProperties,
        wrap: (node: ReactNode) => ReactNode = (node) => node,
    ) {
        act(() => {
            root.render(wrap(<Harness latest={latest} {...properties} />));
        });
    }

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        FakeWorker.instances = [];
        vi.stubGlobal('Worker', FakeWorker);
        vi.mocked(simulatePortfolio).mockClear();
        latest = { current: null };
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('makes no main-thread simulation on a first load with a hazard, and one worker request per scenario', () => {
        render({
            liveTransferHazard: 0.5,
            scenarios: [scenarioOne, scenarioTwo],
        });
        advanceDebounce();

        expect(simulatePortfolio).not.toHaveBeenCalled();
        expect(FakeWorker.instances).toHaveLength(1);
        const [worker] = FakeWorker.instances;
        expect(requestsOf(worker)).toHaveLength(1);
        expect(latest.current?.pending).toBe(true);

        respond(worker, 0, 111);
        expect(requestsOf(worker)).toHaveLength(2);
        expect(latest.current?.pending).toBe(true);

        respond(worker, 1, 222);
        const requests = requestsOf(worker);
        expect(requests.map((request) => request.kind)).toStrictEqual([
            'lab',
            'lab',
        ]);
        expect(requests.map((request) => request.scenario.winrate)).toEqual([
            0.55, 0.6,
        ]);
        expect(
            requests.every((request) => request.run.liveTransferHazard === 0.5),
        ).toBe(true);
        expect(new Set(requests.map((request) => request.runId)).size).toBe(2);
        expect(latest.current?.pending).toBe(false);
        expect(latest.current?.error).toBeNull();
        expect(latest.current?.results.get('one')?.expectedMonthlyNet).toBe(
            111,
        );
        expect(latest.current?.results.get('two')?.expectedMonthlyNet).toBe(
            222,
        );
        expect(simulatePortfolio).not.toHaveBeenCalled();
    });

    it('sends the scenario sizing without its id or label, and the plan as a reference', () => {
        render({ scenarios: [scenarioOne] });
        advanceDebounce();

        const [request] = requestsOf(FakeWorker.instances[0]);
        expect(request?.scenario).not.toHaveProperty('id');
        expect(request?.scenario).not.toHaveProperty('label');
        expect(request).toMatchObject({
            run: {
                plan: {
                    firmId: plan.id.firm,
                    optIns: {
                        takesFundedReset: plan.takesFundedReset,
                        takesOneTimeEarlyWithdrawal:
                            plan.takesOneTimeEarlyWithdrawal,
                    },
                },
            },
        });
    });

    it('reuses the one worker for a hazard edit so its hazard-0 baseline memory survives', () => {
        render({ scenarios: [scenarioOne] });
        advanceDebounce();
        const [worker] = FakeWorker.instances;
        respond(worker, 0);

        render({ liveTransferHazard: 0.5, scenarios: [scenarioOne] });
        advanceDebounce();

        expect(FakeWorker.instances).toHaveLength(1);
        expect(worker?.terminated).toBe(false);
        const requests = requestsOf(worker);
        expect(requests).toHaveLength(2);
        expect(requests[1]?.run.liveTransferHazard).toBe(0.5);
        expect(latest.current?.pending).toBe(true);
    });

    it('ignores a response of a replaced run and finishes only the newer run', () => {
        render({ scenarios: [scenarioOne] });
        advanceDebounce();
        const [stale] = FakeWorker.instances;

        render({ scenarios: [scenarioOne], seed: 2 });
        advanceDebounce();
        const fresh = FakeWorker.instances[1];
        expect(requestsOf(fresh)).toHaveLength(1);

        respond(stale, 0, 1);
        expect(latest.current?.pending).toBe(true);
        expect(latest.current?.results.size).toBe(0);

        respond(fresh, 0, 2);
        expect(latest.current?.pending).toBe(false);
        expect(latest.current?.results.get('one')?.expectedMonthlyNet).toBe(2);
    });

    it('terminates the worker of a replaced run so stale requests never queue ahead of the newer one', () => {
        render({ scenarios: [scenarioOne] });
        advanceDebounce();
        render({ scenarios: [scenarioOne], seed: 2 });
        advanceDebounce();
        render({ scenarios: [scenarioOne], seed: 3 });
        advanceDebounce();

        const live = FakeWorker.instances.filter(
            (worker) => !worker.terminated,
        );
        expect(live).toHaveLength(1);
        expect(requestsOf(live[0])).toHaveLength(1);
        expect(requestsOf(live[0])[0]?.run.seed).toBe(3);
        expect(
            live.reduce((sum, worker) => sum + requestsOf(worker).length, 0),
        ).toBe(1);
    });

    it('keeps the worker when a finished run is replaced', () => {
        render({ scenarios: [scenarioOne] });
        advanceDebounce();
        const [worker] = FakeWorker.instances;
        respond(worker, 0);

        render({ scenarios: [scenarioOne], seed: 2 });
        advanceDebounce();

        expect(worker?.terminated).toBe(false);
        expect(FakeWorker.instances).toHaveLength(1);
    });

    it('is not pending after the inputs revert to the shown key while a newer run was in flight', () => {
        render({ scenarios: [scenarioOne] });
        advanceDebounce();
        respond(FakeWorker.instances[0], 0, 111);
        expect(latest.current?.pending).toBe(false);

        render({ scenarios: [scenarioOne], seed: 2 });
        advanceDebounce();
        expect(latest.current?.pending).toBe(true);

        render({ scenarios: [scenarioOne], seed: 1 });
        advanceDebounce();

        expect(latest.current?.pending).toBe(false);
        expect(latest.current?.error).toBeNull();
        expect(latest.current?.results.get('one')?.expectedMonthlyNet).toBe(
            111,
        );
    });

    it('restores the shown failure, not a clean state, when the inputs revert to a failed key', () => {
        render({ scenarios: [scenarioOne] });
        advanceDebounce();
        const [first] = FakeWorker.instances;
        act(() => {
            first?.emit('message', {
                kind: ToolsResponseKind.Failed,
                reason: 'the engine refused these inputs',
                runId: requestsOf(first)[0]?.runId,
            });
        });
        expect(latest.current?.error).toBe('the engine refused these inputs');

        render({ scenarios: [scenarioOne], seed: 2 });
        advanceDebounce();
        render({ scenarios: [scenarioOne], seed: 1 });
        advanceDebounce();

        expect(latest.current?.pending).toBe(false);
        expect(latest.current?.error).toBe('the engine refused these inputs');
    });

    it('ignores a malformed response of a replaced run without failing the newer run', () => {
        render({ scenarios: [scenarioOne] });
        advanceDebounce();
        const [stale] = FakeWorker.instances;
        const staleRunId = requestsOf(stale)[0]?.runId;

        render({ scenarios: [scenarioOne], seed: 2 });
        advanceDebounce();
        act(() => {
            stale?.emit('message', {
                kind: ToolsResponseKind.Lab,
                result: { nonsense: true },
                runId: staleRunId,
            });
        });

        expect(latest.current?.error).toBeNull();
        expect(latest.current?.pending).toBe(true);
        respond(FakeWorker.instances[1], 0, 5);
        expect(latest.current?.results.get('one')?.expectedMonthlyNet).toBe(5);
    });

    it('fails the run with a readable reason, never raw schema text, on a malformed response it cannot attribute', () => {
        render({ scenarios: [scenarioOne] });
        advanceDebounce();
        const [worker] = FakeWorker.instances;

        act(() => {
            worker?.emit('message', { garbage: true });
        });

        expect(latest.current?.pending).toBe(false);
        expect(latest.current?.results.size).toBe(0);
        expect(latest.current?.error).toContain('unexpected response');
        expect(latest.current?.error).not.toContain('Invalid');
    });

    it('fails the run with a readable reason on a malformed response to the in-flight request', () => {
        render({ scenarios: [scenarioOne] });
        advanceDebounce();
        const [worker] = FakeWorker.instances;

        act(() => {
            worker?.emit('message', {
                kind: ToolsResponseKind.Lab,
                result: { nonsense: true },
                runId: requestsOf(worker)[0]?.runId,
            });
        });

        expect(latest.current?.pending).toBe(false);
        expect(latest.current?.error).toContain('unexpected response');
    });

    it('shows the worker failure reason and no results', () => {
        render({ scenarios: [scenarioOne] });
        advanceDebounce();
        const [worker] = FakeWorker.instances;
        const request = requestsOf(worker)[0];

        act(() => {
            worker?.emit('message', {
                kind: ToolsResponseKind.Failed,
                reason: 'the engine refused these inputs',
                runId: request?.runId,
            });
        });

        expect(latest.current?.error).toBe('the engine refused these inputs');
        expect(latest.current?.results.size).toBe(0);
        expect(latest.current?.pending).toBe(false);
    });

    it('fails the run when the worker errors, and starts a fresh worker for the next run', () => {
        render({ scenarios: [scenarioOne] });
        advanceDebounce();
        const [first] = FakeWorker.instances;

        act(() => {
            first?.emit('error', undefined);
        });
        expect(latest.current?.error).toBe('The tools worker failed.');
        expect(latest.current?.pending).toBe(false);
        expect(first?.terminated).toBe(true);

        render({ scenarios: [scenarioOne], seed: 2 });
        advanceDebounce();

        expect(FakeWorker.instances).toHaveLength(2);
        expect(requestsOf(FakeWorker.instances[1])).toHaveLength(1);
    });

    it('never posts a scenario the sizing refuses, and refuses it by name', () => {
        const refused: LabScenario = {
            ...scenarioTwo,
            instrument: InstrumentSymbol.NQ,
            riskPerTrade: 150,
            stopPoints: 10,
        };

        render({ scenarios: [scenarioOne, refused] });
        advanceDebounce();

        const [worker] = FakeWorker.instances;
        respond(worker, 0);
        expect(requestsOf(worker)).toHaveLength(1);
        expect(latest.current?.refused.map((entry) => entry.item.id)).toEqual([
            'two',
        ]);
        expect(latest.current?.pending).toBe(false);
    });

    it('starts no worker when no scenario can run', () => {
        render({ scenarios: [] });
        advanceDebounce();

        expect(FakeWorker.instances).toHaveLength(0);
        expect(latest.current?.pending).toBe(false);
        expect(latest.current?.results.size).toBe(0);
    });

    it('terminates the worker on unmount', () => {
        render({ scenarios: [scenarioOne] });
        advanceDebounce();
        const [worker] = FakeWorker.instances;

        act(() => {
            root.unmount();
        });

        expect(worker?.terminated).toBe(true);
        root = createRoot(container);
    });

    it('serves a finished run from the shared cache without a new request', () => {
        const cache = new ComputationCache();
        const wrap = (node: ReactNode) => (
            <ComputationCacheContext.Provider value={cache}>
                {node}
            </ComputationCacheContext.Provider>
        );
        render({ scenarios: [scenarioOne] }, wrap);
        advanceDebounce();
        respond(FakeWorker.instances[0], 0, 321);

        act(() => {
            root.unmount();
        });
        root = createRoot(container);
        latest = { current: null };
        render({ scenarios: [scenarioOne] }, wrap);
        advanceDebounce();

        expect(FakeWorker.instances).toHaveLength(1);
        expect(latest.current?.pending).toBe(false);
        expect(latest.current?.results.get('one')?.expectedMonthlyNet).toBe(
            321,
        );
    });
});
