import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ladderSearchInputsFor } from '~/app/(app)/prop-calculator/_components/ladderLabRestore';
import {
    LadderRunPhase,
    type LadderSearchInputs,
    type LadderSearchState,
} from '~/app/(app)/prop-calculator/_components/ladderSearchTypes';
import { useLadderSearch } from '~/app/(app)/prop-calculator/_components/useLadderSearch';
import {
    type LadderWorkerRequest,
    LadderWorkerResponseKind,
} from '~/app/(app)/prop-calculator/_workers/ladderWorkerMessages';
import {
    ApexVariant,
    DayStopRuleKind,
    FirmId,
    InstrumentSymbol,
    type LadderScore,
    RungSizing,
} from '~/lib/prop-calculator';
import { findFirm } from '~/lib/prop-calculator/firms';

import { FakeWorker } from './toolsWorkerFixtures';

const HARDWARE_THREADS = 4;

const SCORE: LadderScore = {
    costPerFunded: 900,
    costPerFundedStandardError: 20,
    expectedDaysToFunded: 12,
    expectedDaysToFundedStandardError: 0.5,
    ladder: [200, 300, 400],
    meanDaysOnFail: 5,
    meanDaysOnPass: 9,
    passRate: 0.4,
    passRateStandardError: 0.01,
};

function scoredBy(worker: FakeWorker, runId: number) {
    const request = worker.posted.at(-1) as LadderWorkerRequest;
    act(() => {
        worker.emit('message', {
            firstIndex: request.firstIndex,
            kind: LadderWorkerResponseKind.Scored,
            runId,
            scores: request.ladders.map(() => SCORE),
        });
    });
}

function searchInputs(): LadderSearchInputs {
    const plan = findFirm(FirmId.Apex)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (!plan) throw new Error('Apex EOD 50K plan not found');
    return ladderSearchInputsFor(
        {
            fundedHorizonDays: 60,
            instrument: InstrumentSymbol.NQ,
            maxEvalDays: 60,
            plan,
            riskPerTrade: 250,
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            seed: 42,
            stopPoints: 10,
            tradesPerDay: 2,
            trials: 2000,
            winrate: 0.4,
        },
        {
            displayInstrument: InstrumentSymbol.NQ,
            grid: { lo: 100, max: 400, slots: 3, step: 50 },
            rungSizing: RungSizing.CapToCushion,
            sims: 100,
            stopRule: { kind: DayStopRuleKind.DayGreen },
        },
    );
}

describe('useLadderSearch', () => {
    let container: HTMLDivElement;
    let root: Root;
    let latest: null | ReturnType<typeof useLadderSearch>;
    let renders: number;

    function Harness() {
        latest = useLadderSearch();
        renders += 1;
        return null;
    }

    function hook(): ReturnType<typeof useLadderSearch> {
        if (latest === null) throw new Error('hook not rendered');
        return latest;
    }

    function phase(): LadderRunPhase {
        const { state }: { state: LadderSearchState } = hook();
        return state.phase;
    }

    function start() {
        act(() => {
            hook().run(searchInputs());
        });
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        vi.stubGlobal('Worker', FakeWorker);
        Object.defineProperty(navigator, 'hardwareConcurrency', {
            configurable: true,
            value: HARDWARE_THREADS,
        });
        FakeWorker.instances = [];
        latest = null;
        renders = 0;
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(<Harness />);
        });
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        Reflect.deleteProperty(navigator, 'hardwareConcurrency');
        vi.unstubAllGlobals();
    });

    it('starts one worker per spare thread, each given a block', () => {
        start();
        expect(phase()).toBe(LadderRunPhase.Running);
        expect(FakeWorker.instances).toHaveLength(HARDWARE_THREADS - 1);
        for (const worker of FakeWorker.instances) {
            expect(worker.posted).toHaveLength(1);
            expect(worker.terminated).toBe(false);
        }
    });

    it('terminates every worker when it unmounts mid-run', () => {
        start();
        expect(FakeWorker.instances.length).toBeGreaterThan(1);
        act(() => {
            root.unmount();
        });
        expect(FakeWorker.instances.map((worker) => worker.terminated)).toEqual(
            FakeWorker.instances.map(() => true),
        );
        root = createRoot(container);
    });

    it('writes no state for a message that arrives after it unmounted', () => {
        start();
        const [worker] = FakeWorker.instances;
        if (worker === undefined) throw new Error('no worker');
        const runId = (worker.posted[0] as LadderWorkerRequest).runId;
        act(() => {
            root.unmount();
        });
        const rendersAtUnmount = renders;
        scoredBy(worker, runId);
        expect(renders).toBe(rendersAtUnmount);
        root = createRoot(container);
    });

    it('terminates every worker on cancel and reports Cancelled with the progress so far', () => {
        start();
        act(() => {
            hook().cancel();
        });
        expect(FakeWorker.instances.map((worker) => worker.terminated)).toEqual(
            FakeWorker.instances.map(() => true),
        );
        expect(phase()).toBe(LadderRunPhase.Cancelled);
    });

    it('ignores every message after cancel', () => {
        start();
        const [worker] = FakeWorker.instances;
        if (worker === undefined) throw new Error('no worker');
        const runId = (worker.posted[0] as LadderWorkerRequest).runId;
        act(() => {
            hook().cancel();
        });
        const before = hook().state;
        const rendersAtCancel = renders;
        scoredBy(worker, runId);
        act(() => {
            worker.emit('message', {
                kind: LadderWorkerResponseKind.Failed,
                reason: 'late',
                runId,
            });
        });
        expect(hook().state).toBe(before);
        expect(renders).toBe(rendersAtCancel);
        expect(phase()).toBe(LadderRunPhase.Cancelled);
    });

    it('keeps cancel on an idle search idle and terminates nothing', () => {
        act(() => {
            hook().cancel();
        });
        expect(phase()).toBe(LadderRunPhase.Idle);
        expect(FakeWorker.instances).toHaveLength(0);
    });
});
