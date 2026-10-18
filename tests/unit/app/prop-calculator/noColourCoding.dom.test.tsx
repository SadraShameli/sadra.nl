import type * as Recharts from 'recharts';

import { act, cloneElement, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';

vi.mock('recharts', async (importOriginal) => {
    const actual = await importOriginal<typeof Recharts>();
    return {
        ...actual,
        ResponsiveContainer: ({ children }: { children: ReactElement }) =>
            cloneElement(children, { height: 200, width: 400 } as never),
    };
});

vi.mock(
    '~/app/(app)/prop-calculator/_components/useDebouncedSimulation',
    () => ({
        useDebouncedComputation: (
            _id: unknown,
            _key: unknown,
            _debounceMs: unknown,
            compute: () => unknown,
        ) => ({
            error: null,
            pending: false,
            result: compute(),
        }),
    }),
);

vi.mock('~/components/ui/info-popover', () => ({
    default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import AccountsPassedDistributionChart from '~/app/(app)/prop-calculator/_components/AccountsPassedDistributionChart';
import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import DaysToPassHistogramView from '~/app/(app)/prop-calculator/_components/charts/DaysToPassHistogramView';
import DrawdownCurveChartView from '~/app/(app)/prop-calculator/_components/charts/DrawdownCurveChartView';
import EquityCurveChartView from '~/app/(app)/prop-calculator/_components/charts/EquityCurveChartView';
import FinalBalanceHistogramView from '~/app/(app)/prop-calculator/_components/charts/FinalBalanceHistogramView';
import PassRateByDayChartView from '~/app/(app)/prop-calculator/_components/charts/PassRateByDayChartView';
import RuleStressBarChartView from '~/app/(app)/prop-calculator/_components/charts/RuleStressBarChartView';
import DrawdownDurationPanel from '~/app/(app)/prop-calculator/_components/DrawdownDurationPanel';
import ResiliencePanel from '~/app/(app)/prop-calculator/_components/ResiliencePanel';
import RuleStressTestPanel from '~/app/(app)/prop-calculator/_components/RuleStressTestPanel';
import StrategyAnalysis from '~/app/(app)/prop-calculator/_components/StrategyAnalysis';
import TailRiskPanel from '~/app/(app)/prop-calculator/_components/TailRiskPanel';
import { buildSimInputs } from '~/app/(app)/prop-calculator/_components/useCalculator';
import {
    type SimInputs,
    type SimOutputs,
    simulate,
} from '~/lib/prop-calculator';

const COLOUR_CODING_CLASS =
    /(?:^|[\s:"])(?:text|bg|border|fill|stroke)-(?:success|warning|destructive|danger)\b/;

const STATUS_COLOUR_TOKEN =
    /var\(--(?:success|warning|destructive|danger|info)\)/;

const FAST_TRIALS = 200;

const WINNING_INPUTS = { rrRatio: 2, winrate: 0.6 } as const;

const LOSING_INPUTS = { rrRatio: 1, winrate: 0.3 } as const;

interface Scenario {
    readonly inputs: SimInputs;
    readonly name: string;
    readonly result: SimOutputs;
}

function expectNeutral(markup: string): void {
    expect(markup).not.toMatch(COLOUR_CODING_CLASS);
    expect(markup).not.toMatch(STATUS_COLOUR_TOKEN);
}

function scenario(
    name: string,
    edge: typeof LOSING_INPUTS | typeof WINNING_INPUTS,
): Scenario {
    const inputs: SimInputs = {
        ...buildSimInputs(defaultCalculatorState()),
        ...edge,
        trials: FAST_TRIALS,
    };
    return { inputs, name, result: simulate(inputs) };
}

describe('the prop calculator panels and charts never colour code a value (wave 7)', () => {
    let container: HTMLDivElement;
    let root: Root;
    let scenarios: readonly Scenario[] = [];

    beforeAll(() => {
        scenarios = [
            scenario('a winning edge', WINNING_INPUTS),
            scenario('a losing edge', LOSING_INPUTS),
        ];
    });

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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

    function markupOf(node: ReactNode): string {
        act(() => {
            root.render(node);
        });
        return container.getHTML();
    }

    it('keeps the tail risk, drawdown, resilience and strategy panels in the default ink for a winning and a losing edge', () => {
        for (const { inputs, result } of scenarios) {
            expectNeutral(markupOf(<TailRiskPanel result={result} />));
            expectNeutral(markupOf(<DrawdownDurationPanel result={result} />));
            expectNeutral(
                markupOf(
                    <ResiliencePanel baseInputs={inputs} result={result} />,
                ),
            );
            expectNeutral(
                markupOf(
                    <StrategyAnalysis baseInputs={inputs} result={result} />,
                ),
            );
            expectNeutral(
                markupOf(<RuleStressTestPanel baseInputs={inputs} />),
            );
        }
    });

    it('draws the simulation charts from the chart palette, never a pass or fail colour', () => {
        for (const { inputs, result } of scenarios) {
            expectNeutral(markupOf(<EquityCurveChartView result={result} />));
            expectNeutral(markupOf(<DrawdownCurveChartView result={result} />));
            expectNeutral(
                markupOf(<DaysToPassHistogramView result={result} />),
            );
            expectNeutral(
                markupOf(<FinalBalanceHistogramView result={result} />),
            );
            expectNeutral(
                markupOf(
                    <PassRateByDayChartView
                        maxEvalDays={inputs.maxEvalDays}
                        result={result}
                        totalTrials={FAST_TRIALS}
                    />,
                ),
            );
            expectNeutral(
                markupOf(
                    <AccountsPassedDistributionChart
                        distribution={[0.2, 0.5, 0.3]}
                    />,
                ),
            );
        }
    });

    it('fills every rule stress bar with one colour whether it beats the baseline or not', () => {
        const markup = markupOf(
            <RuleStressBarChartView
                rows={[
                    { label: 'Baseline', monthlyNet: 400 },
                    { label: 'Tighter DLL', monthlyNet: -150 },
                    { label: 'Looser target', monthlyNet: 650 },
                ]}
            />,
        );
        expectNeutral(markup);
        const fills = new Set(
            [
                ...container.querySelectorAll(
                    ':scope .recharts-bar-rectangle path, :scope .recharts-bar-rectangle rect',
                ),
            ].map((bar) => bar.getAttribute('fill')),
        );
        expect(fills.size).toBe(1);
    });
});
