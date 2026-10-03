import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    expectTypeOf,
    it,
    vi,
} from 'vitest';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { type LabScenario } from '~/app/(app)/prop-calculator/_components/types';
import {
    type LabResult,
    useLabSimulation,
} from '~/app/(app)/prop-calculator/_components/useLabSimulation';
import {
    CorrelationMode,
    DayStopRuleKind,
    type Fraction0to1,
    simulatePortfolio,
} from '~/lib/prop-calculator';
import {
    EconomicsReason,
    evalPace,
    twoBarrierExpectedTrades,
    twoBarrierPassProbability,
    walkPassProbability,
} from '~/lib/prop-calculator/economics';

import { InlineToolsWorker } from './labWorkerFixtures';

vi.mock(import('~/lib/prop-calculator'), async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        simulatePortfolio: vi.fn(actual.simulatePortfolio),
    };
});

vi.mock(import('~/lib/prop-calculator/economics'), async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        evalPace: vi.fn(actual.evalPace),
        twoBarrierExpectedTrades: vi.fn(actual.twoBarrierExpectedTrades),
        twoBarrierPassProbability: vi.fn(actual.twoBarrierPassProbability),
        walkPassProbability: vi.fn(actual.walkPassProbability),
    };
});

const plan = defaultCalculatorState().plan;

const baseScenario: LabScenario = {
    accounts: 1,
    correlation: CorrelationMode.Copy,
    dayStop: { kind: DayStopRuleKind.None },
    groups: 1,
    id: 'one-to-two',
    instrument: null,
    label: 'One to two',
    riskPerTrade: 250,
    rrRatio: 2,
    stopPoints: null,
    tradesPerDay: 1,
    winrate: 0.4,
};

const scenarios: LabScenario[] = [
    baseScenario,
    {
        ...baseScenario,
        id: 'unrepresentable',
        label: 'Unrepresentable',
        rrRatio: 1.333,
    },
];

function flush() {
    for (let round = 0; round < 4; round++) {
        act(() => {
            vi.runOnlyPendingTimers();
        });
    }
}

describe('the lab renders the library walk pass probability and never computes the walk itself', () => {
    let container: HTMLDivElement;
    let latest: Map<string, LabResult> | null;
    let root: Root;

    function Harness() {
        latest = useLabSimulation({
            commissionPerRoundTrip: 0,
            fundedHorizonDays: 5,
            maxEvalDays: 10,
            plan,
            scenarios,
            seed: 1,
        }).results;
        return null;
    }

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        vi.stubGlobal('Worker', InlineToolsWorker);
        vi.mocked(walkPassProbability).mockClear();
        vi.mocked(evalPace).mockClear();
        vi.mocked(twoBarrierPassProbability).mockClear();
        vi.mocked(twoBarrierExpectedTrades).mockClear();
        vi.mocked(simulatePortfolio).mockClear();
        latest = null;
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(<Harness />);
        });
        flush();
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

    it('asks walkPassProbability once per scenario with the plan target and drawdown and the scenario sizing', () => {
        expect(simulatePortfolio).toHaveBeenCalledTimes(scenarios.length);
        expect(vi.mocked(walkPassProbability).mock.calls).toStrictEqual(
            scenarios.map((scenario) => [
                {
                    drawdown: plan.drawdown.amount,
                    riskPerTrade: scenario.riskPerTrade,
                    rrRatio: scenario.rrRatio,
                    target: plan.profitTarget,
                    winrate: scenario.winrate,
                },
            ]),
        );
    });

    it('carries the library result as one branded probability or one reason, never both or neither', () => {
        expectTypeOf<LabResult['theoreticalPassProb']>().toEqualTypeOf<
            Fraction0to1 | undefined
        >();
        expectTypeOf<
            Extract<
                LabResult,
                { theoreticalPassReason: EconomicsReason }
            >['theoreticalPassProb']
        >().toEqualTypeOf<undefined>();
        expectTypeOf<
            Extract<
                LabResult,
                { theoreticalPassProb: Fraction0to1 }
            >['theoreticalPassReason']
        >().toEqualTypeOf<undefined>();
    });

    it('calls no other walk function', () => {
        expect(evalPace).not.toHaveBeenCalled();
        expect(twoBarrierPassProbability).not.toHaveBeenCalled();
        expect(twoBarrierExpectedTrades).not.toHaveBeenCalled();
    });

    it('renders the library value or its reason unchanged', () => {
        const [solved, unrepresentable] = vi
            .mocked(walkPassProbability)
            .mock.results.map((result) => result.value as unknown);
        expect(solved).toMatchObject({ reason: null });
        expect(latest?.get('one-to-two')?.theoreticalPassProb).toBe(
            (solved as { value: number }).value,
        );
        expect(
            latest?.get('one-to-two')?.theoreticalPassReason,
        ).toBeUndefined();
        expect(unrepresentable).toMatchObject({
            reason: EconomicsReason.UnsupportedRatio,
            value: null,
        });
        expect(
            latest?.get('unrepresentable')?.theoreticalPassProb,
        ).toBeUndefined();
        expect(latest?.get('unrepresentable')?.theoreticalPassReason).toBe(
            EconomicsReason.UnsupportedRatio,
        );
    });
});
