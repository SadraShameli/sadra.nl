import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisView } from '~/app/(app)/prop-calculator/(tools)/analysis/AnalysisView';
import { SimulatorView } from '~/app/(app)/prop-calculator/(tools)/simulator/SimulatorView';
import { CalculatorInputsForm } from '~/app/(app)/prop-calculator/_components/CalculatorInputsForm';
import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import CashFlowPanel from '~/app/(app)/prop-calculator/_components/CashFlowPanel';
import FirmComparisonTable from '~/app/(app)/prop-calculator/_components/FirmComparisonTable';
import OptimalRiskTable from '~/app/(app)/prop-calculator/_components/OptimalRiskTable';
import PlanComparisonTable from '~/app/(app)/prop-calculator/_components/PlanComparisonTable';
import PortfolioPanel from '~/app/(app)/prop-calculator/_components/PortfolioPanel';
import RuleStressTestPanel from '~/app/(app)/prop-calculator/_components/RuleStressTestPanel';
import SensitivityHeatmap from '~/app/(app)/prop-calculator/_components/SensitivityHeatmap';
import StrategyLabPanel from '~/app/(app)/prop-calculator/_components/StrategyLabPanel';
import {
    type CalculatorState,
    ChartType,
    type LabScenario,
    type PortfolioEntry,
} from '~/app/(app)/prop-calculator/_components/types';
import { buildSimInputs } from '~/app/(app)/prop-calculator/_components/useCalculator';
import {
    ALL_FIRMS,
    CorrelationMode,
    DayStopRuleKind,
    InstrumentSymbol,
    type PlanOptIns,
    type SimInputs,
    simulate,
    simulatePortfolio,
} from '~/lib/prop-calculator';
import { simulatePortfolioTimeline } from '~/lib/prop-calculator/portfolioTimeline';
import {
    type SimInputsSizingInputs,
    simInputsSizingIssue,
} from '~/lib/prop-calculator/simulator';

interface ProviderHarness {
    base: { isPending: boolean; result: null };
    inputs: {
        debouncedQuery: string;
        firms: typeof ALL_FIRMS;
        planOptIns: PlanOptIns;
        simInputs: SimInputs;
        state: CalculatorState;
    };
}

const harness = vi.hoisted(
    (): {
        actions: Record<string, () => void>;
        current: null | ProviderHarness;
    } => ({
        actions: new Proxy({}, { get: () => vi.fn() }),
        current: null,
    }),
);

vi.mock(import('~/lib/prop-calculator'), async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        simulate: vi.fn(actual.simulate),
        simulatePortfolio: vi.fn(actual.simulatePortfolio),
    };
});

vi.mock(
    import('~/lib/prop-calculator/portfolioTimeline'),
    async (importOriginal) => {
        const actual = await importOriginal();
        return {
            ...actual,
            simulatePortfolioTimeline: vi.fn(actual.simulatePortfolioTimeline),
        };
    },
);

vi.mock('next/dynamic', () => ({ default: () => renderNothing }));

vi.mock('next/navigation', () => ({
    usePathname: () => '/',
    useRouter: () => ({ replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock('~/app/(app)/prop-calculator/_components/ToolPageHeading', () => ({
    ToolPageHeading: renderNothing,
}));

vi.mock('~/app/(app)/prop-calculator/_components/InputsSummary', () => ({
    InputsSummary: renderNothing,
}));

vi.mock('~/app/(app)/prop-calculator/_components/CalculatorProvider', () => ({
    useBaseResult: () => currentProvider().base,
    useCalculatorActions: () => harness.actions,
    useCalculatorInputs: () => currentProvider().inputs,
    useLabSlots: () => ({
        chartType: ChartType.DaysToPassHistogram,
        ladderSlot: null,
        pinned: null,
    }),
}));

const SMALL_TRIALS = 4;
const NO_OPT_INS: PlanOptIns = {
    takesFundedReset: false,
    takesOneTimeEarlyWithdrawal: false,
};
const NOTICE = '.app-prop-calculator__simulation-failure';

function currentProvider(): ProviderHarness {
    if (harness.current === null) throw new Error('no provider state');
    return harness.current;
}

function hintText(container: HTMLElement): string {
    return container.querySelector('#position-sizing-hint')?.textContent ?? '';
}

function provide(state: CalculatorState) {
    harness.current = {
        base: { isPending: false, result: null },
        inputs: {
            debouncedQuery: '',
            firms: ALL_FIRMS,
            planOptIns: NO_OPT_INS,
            simInputs: buildSimInputs(state),
            state,
        },
    };
}

function refusedState(): CalculatorState {
    return stateWith({
        instrument: InstrumentSymbol.NQ,
        riskDollars: 150,
        stopPoints: 10,
    });
}

function renderNothing(): null {
    return null;
}

function requiredIssue(inputs: SimInputsSizingInputs): string {
    const issue = simInputsSizingIssue(inputs);
    if (issue === null) throw new Error('expected a refused input');
    return issue;
}

function stateWith(patch: Partial<CalculatorState>): CalculatorState {
    return { ...defaultCalculatorState(), trials: SMALL_TRIALS, ...patch };
}

describe('refused sizing in the web panels (PT-11f)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(node: ReactNode) {
        act(() => {
            root.render(node);
        });
        for (let round = 0; round < 4; round++) {
            act(() => {
                vi.runOnlyPendingTimers();
            });
        }
    }

    function notices(): string[] {
        return [...container.querySelectorAll(NOTICE)].map(
            (node) => node.textContent,
        );
    }

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        vi.mocked(simulate).mockClear();
        vi.mocked(simulatePortfolio).mockClear();
        vi.mocked(simulatePortfolioTimeline).mockClear();
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        harness.current = null;
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    describe('the risk and stop inputs', () => {
        it('show the refusal text and the placed funded risk for NQ at a 10 point stop and $150', () => {
            const state = refusedState();
            provide(state);
            render(<CalculatorInputsForm />);
            expect(hintText(container)).toContain(
                requiredIssue(buildSimInputs(state)),
            );
            expect(hintText(container)).toContain(
                'Funded risk placed in whole contracts: 0 NQ at a 10 point stop, $0 per trade',
            );
            const risk = container.querySelector(
                'input[type="number"][step="10"]',
            );
            expect(risk?.getAttribute('aria-describedby')).toBe(
                'position-sizing-hint',
            );
            expect(risk?.getAttribute('aria-invalid')).toBe('true');
        });

        it('show the whole contracts placed when the risk is accepted', () => {
            provide(
                stateWith({
                    instrument: InstrumentSymbol.NQ,
                    riskDollars: 450,
                    stopPoints: 10,
                }),
            );
            render(<CalculatorInputsForm />);
            expect(hintText(container)).toBe(
                'Funded risk placed in whole contracts: 2 NQ at a 10 point stop, $400 per trade.',
            );
        });

        it('say when the funded contract limit caps the placed risk', () => {
            provide(
                stateWith({
                    instrument: InstrumentSymbol.NQ,
                    riskDollars: 20_000,
                    stopPoints: 10,
                }),
            );
            render(<CalculatorInputsForm />);
            expect(hintText(container)).toContain(
                'capped at the funded contract limit at the start tier',
            );
        });

        it('show no hint for the default inputs (stop points off)', () => {
            provide(stateWith({}));
            render(<CalculatorInputsForm />);
            expect(container.querySelector('#position-sizing-hint')).toBeNull();
            const risk = container.querySelector(
                'input[type="number"][step="10"]',
            );
            expect(risk?.getAttribute('aria-invalid')).toBe('false');
            expect(risk?.getAttribute('aria-describedby')).toBeNull();
        });
    });

    describe('the base result pages', () => {
        it('the simulator page shows the refusal in the results aside and the charts instead of a skeleton', () => {
            const state = refusedState();
            provide(state);
            render(<SimulatorView />);
            const issue = requiredIssue(buildSimInputs(state));
            expect(notices()).toEqual([issue, issue]);
            expect(container.querySelector('.animate-pulse')).toBeNull();
        });

        it('the analysis page shows the refusal in every base result section', () => {
            const state = refusedState();
            provide(state);
            render(<AnalysisView />);
            const issue = requiredIssue(buildSimInputs(state));
            expect(notices()).toEqual([issue, issue, issue, issue]);
        });

        it('the default inputs still show the skeleton while the result is pending', () => {
            provide(stateWith({}));
            render(<SimulatorView />);
            expect(notices()).toEqual([]);
            expect(container.querySelector('.animate-pulse')).not.toBeNull();
        });
    });

    describe('the debounced panels', () => {
        const refused = buildSimInputs(refusedState());

        it.each([
            [
                'SensitivityHeatmap',
                () => (
                    <SensitivityHeatmap
                        baseInputs={refused}
                        currentRR={2}
                        currentWinrate={0.4}
                    />
                ),
            ],
            [
                'FirmComparisonTable',
                () => (
                    <FirmComparisonTable
                        activeFirmId={refused.plan.id.firm}
                        baseInputs={refused}
                        firms={ALL_FIRMS}
                        planOptIns={NO_OPT_INS}
                        targetAccountSize={50_000}
                    />
                ),
            ],
            [
                'PlanComparisonTable',
                () => (
                    <PlanComparisonTable
                        activePlan={refused.plan}
                        baseInputs={refused}
                        firm={defaultCalculatorState().firm}
                        planOptIns={NO_OPT_INS}
                    />
                ),
            ],
            [
                'RuleStressTestPanel',
                () => <RuleStressTestPanel baseInputs={refused} />,
            ],
        ])('%s runs no simulation and shows the refusal', (_, panel) => {
            provide(refusedState());
            render(panel());
            expect(simulate).not.toHaveBeenCalled();
            expect(notices()).toEqual([requiredIssue(refused)]);
        });

        it('OptimalRiskTable leaves out the risk levels below one contract and simulates the rest', () => {
            const state = stateWith({
                instrument: InstrumentSymbol.NQ,
                riskDollars: 450,
                stopPoints: 10,
            });
            provide(state);
            render(
                <OptimalRiskTable
                    baseInputs={buildSimInputs(state)}
                    currentRiskPercent={1}
                    plan={state.plan}
                />,
            );
            const risks = vi
                .mocked(simulate)
                .mock.calls.map(([inputs]) => inputs.riskPerTrade);
            expect(risks).not.toContain(125);
            expect(risks).toHaveLength(9);
            expect(notices()).toEqual([
                'Not simulated: 0.25% (below one contract at the stop, so funded flat risk would never trade).',
            ]);
        });

        it('PortfolioPanel skips a refused planner row, says why, and simulates the others', () => {
            const state = stateWith({ riskDollars: 150 });
            provide(state);
            const [apex] = state.portfolio;
            if (apex === undefined) throw new Error('default portfolio row');
            const refusedRow: PortfolioEntry = {
                ...apex,
                id: 'refused-row',
                instrument: InstrumentSymbol.NQ,
                stopPoints: 10,
            };
            render(
                <PortfolioPanel
                    baseInputs={buildSimInputs(state)}
                    currentFirm={state.firm}
                    currentPlan={state.plan}
                    firms={ALL_FIRMS}
                    onPortfolioChange={vi.fn()}
                    planOptIns={NO_OPT_INS}
                    portfolio={[apex, refusedRow]}
                />,
            );
            expect(simulate).toHaveBeenCalledTimes(1);
            const issue = requiredIssue({
                ...buildSimInputs(state),
                instrument: InstrumentSymbol.NQ,
                stopPoints: 10,
            });
            expect(notices()).toEqual([
                `Not simulated and left out of the totals, ${state.firm.displayName} ${state.plan.label}: ${issue}`,
            ]);
        });

        it('StrategyLabPanel skips a refused scenario, says why, and simulates the others', () => {
            const state = stateWith({});
            provide(state);
            const accepted: LabScenario = {
                accounts: 2,
                correlation: CorrelationMode.Copy,
                dayStop: { kind: DayStopRuleKind.None },
                groups: 1,
                id: 'accepted',
                instrument: null,
                label: 'Accepted',
                riskPerTrade: 250,
                rrRatio: 2,
                stopPoints: null,
                tradesPerDay: 1,
                winrate: 0.4,
            };
            const refusedScenario: LabScenario = {
                ...accepted,
                id: 'refused',
                instrument: InstrumentSymbol.NQ,
                label: 'Refused NQ',
                riskPerTrade: 150,
                stopPoints: 10,
            };
            render(
                <StrategyLabPanel
                    activationDiscountPercent={0}
                    commissionPerRoundTrip={0}
                    evalDiscountPercent={0}
                    fundedHorizonDays={20}
                    linkActivationDiscount={false}
                    maxEvalDays={20}
                    minRetainedCushion={undefined}
                    monthlySubscriptionDiscountPercent={0}
                    onAdd={vi.fn()}
                    onRemove={vi.fn()}
                    onReset={vi.fn()}
                    onUpdate={vi.fn()}
                    payoutRequestSize={undefined}
                    plan={state.plan}
                    resetDiscountPercent={0}
                    rungSizing={undefined}
                    scenarios={[accepted, refusedScenario]}
                    seed={1}
                />,
            );
            expect(simulatePortfolio).toHaveBeenCalledTimes(1);
            const issue = requiredIssue({
                instrument: InstrumentSymbol.NQ,
                riskPerTrade: 150,
                stopPoints: 10,
            });
            expect(notices()).toEqual([`Not simulated, Refused NQ: ${issue}`]);
        });

        it('CashFlowPanel shows a thrown engine error as a readable message', () => {
            const state = stateWith({});
            provide(state);
            vi.mocked(simulatePortfolioTimeline).mockImplementationOnce(() => {
                throw new Error(
                    'runAccountTimeline: dayBudget must be positive',
                );
            });
            render(
                <CashFlowPanel
                    baseInputs={buildSimInputs(state)}
                    firmDisplayName={state.firm.displayName}
                    maxAccounts={5}
                />,
            );
            expect(notices()).toEqual([
                'runAccountTimeline: dayBudget must be positive',
            ]);
        });
    });
});
