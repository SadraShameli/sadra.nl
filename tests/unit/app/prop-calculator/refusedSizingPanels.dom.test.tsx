import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as UseToolsWorkerModule from '~/app/(app)/prop-calculator/_components/useToolsWorker';

import { AnalysisView } from '~/app/(app)/prop-calculator/(tools)/analysis/AnalysisView';
import { SimulatorView } from '~/app/(app)/prop-calculator/(tools)/simulator/SimulatorView';
import { CalculatorInputsForm } from '~/app/(app)/prop-calculator/_components/CalculatorInputsForm';
import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import CashFlowPanel from '~/app/(app)/prop-calculator/_components/CashFlowPanel';
import FirmComparisonTable from '~/app/(app)/prop-calculator/_components/FirmComparisonTable';
import { funnelWhatIfFromForm } from '~/app/(app)/prop-calculator/_components/FunnelWhatIfSection';
import OptimalRiskTable from '~/app/(app)/prop-calculator/_components/OptimalRiskTable';
import PlanComparisonTable from '~/app/(app)/prop-calculator/_components/PlanComparisonTable';
import PortfolioPanel from '~/app/(app)/prop-calculator/_components/PortfolioPanel';
import RuleStressTestPanel from '~/app/(app)/prop-calculator/_components/RuleStressTestPanel';
import SensitivityHeatmap from '~/app/(app)/prop-calculator/_components/SensitivityHeatmap';
import StrategyLabPanel from '~/app/(app)/prop-calculator/_components/StrategyLabPanel';
import {
    type CalculatorState,
    ChartType,
    LabLinkStatus,
    type LabScenario,
    type PortfolioEntry,
} from '~/app/(app)/prop-calculator/_components/types';
import { buildSimInputs } from '~/app/(app)/prop-calculator/_components/useCalculator';
import { useCashFlowSimulation } from '~/app/(app)/prop-calculator/_components/useCashFlowSimulation';
import { formatCompactCurrency } from '~/lib/format';
import {
    ALL_FIRMS,
    CorrelationMode,
    DayStopRuleKind,
    dollars,
    fraction,
    InstrumentSymbol,
    type PlanOptIns,
    type SimInputs,
    simulate,
    simulatePortfolio,
} from '~/lib/prop-calculator';
import {
    ECONOMICS_DISCLOSURE_TEXT,
    EconomicsDisclosure,
    fundedValueToAttemptCostLabel,
    funnelWhatIf,
} from '~/lib/prop-calculator/economics';
import { simulatePortfolioTimeline } from '~/lib/prop-calculator/portfolioTimeline';
import {
    type SimInputsSizingInputs,
    simInputsSizingIssue,
} from '~/lib/prop-calculator/simulator';

import { InlineToolsWorker } from './labWorkerFixtures';

interface ProviderHarness {
    base: { error: null | string; isPending: boolean; result: null };
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

const resolverRuns = vi.hoisted(() => ({ count: 0 }));

vi.mock(import('@hookform/resolvers/zod'), async (importOriginal) => {
    const actual = await importOriginal();
    const countingZodResolver = ((
        ...parameters: Parameters<typeof actual.zodResolver>
    ) => {
        const resolver = actual.zodResolver(...parameters);
        const counting: typeof resolver = (values, context, options) => {
            resolverRuns.count += 1;
            return resolver(values, context, options);
        };
        return counting;
    }) as typeof actual.zodResolver;
    return { ...actual, zodResolver: countingZodResolver };
});

vi.mock(
    import('~/app/(app)/prop-calculator/_components/useCashFlowSimulation'),
    async (importOriginal) => {
        const actual = await importOriginal();
        return {
            ...actual,
            useCashFlowSimulation: vi.fn(actual.useCashFlowSimulation),
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

vi.mock(
    '~/app/(app)/prop-calculator/_components/useToolsWorker',
    async (importOriginal) => {
        const actual = await importOriginal<typeof UseToolsWorkerModule>();
        return {
            createToolsWorker: actual.createToolsWorker,
            ToolsWorkerPhase: actual.ToolsWorkerPhase,
            useToolsWorker: () => ({
                cancel: vi.fn(),
                run: vi.fn(),
                state: { phase: actual.ToolsWorkerPhase.Idle },
            }),
            WORKER_FAILURE_REASON: actual.WORKER_FAILURE_REASON,
        };
    },
);

vi.mock('~/lib/auth/client', () => ({
    useSession: () => ({ data: null, error: null, isPending: false }),
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            rulebook: {
                get: { useQuery: () => ({ data: undefined }) },
            },
        },
    },
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
    useObjectiveChoice: () => ({ automaticBasis: null, queryFailure: null }),
}));

const SMALL_TRIALS = 4;
const NO_OPT_INS: PlanOptIns = {
    takesFundedReset: false,
    takesOneTimeEarlyWithdrawal: false,
};
const NOTICE = '.app-prop-calculator__simulation-failure';
const PENDING_BASE: ProviderHarness['base'] = {
    error: null,
    isPending: true,
    result: null,
};
const FAILED_BASE: ProviderHarness['base'] = {
    error: null,
    isPending: false,
    result: null,
};
const BASE_FAILURE_TEXT =
    'The simulation could not run for these inputs, so there is no result to show. Change an input to run it again.';

function cashFlowPanelWithoutTimeline(): ReactNode {
    const state = stateWith({});
    provide(state);
    vi.mocked(simulatePortfolioTimeline).mockImplementationOnce(() => {
        throw new Error('timeline skipped for the what-if');
    });
    return (
        <CashFlowPanel
            baseInputs={buildSimInputs(state)}
            firmDisplayName={state.firm.displayName}
            maxAccounts={5}
        />
    );
}

function currentProvider(): ProviderHarness {
    if (harness.current === null) throw new Error('no provider state');
    return harness.current;
}

async function fillWhatIf(
    container: HTMLElement,
    passRate: string,
): Promise<void> {
    await setNumberInput(container, 'cash-flow-what-if-attempts', '100');
    await setNumberInput(container, 'cash-flow-what-if-pass-rate', passRate);
    await setNumberInput(container, 'cash-flow-what-if-payout-rate', '50');
    await setNumberInput(container, 'cash-flow-what-if-average-payout', '2000');
    await setNumberInput(container, 'cash-flow-what-if-attempt-cost', '165');
}

function hintText(container: HTMLElement): string {
    return container.querySelector('#position-sizing-hint')?.textContent ?? '';
}

function limitTimelineTrials(): void {
    const original = vi
        .mocked(simulatePortfolioTimeline)
        .getMockImplementation();
    if (!original) throw new Error('the timeline spy has no implementation');
    vi.mocked(simulatePortfolioTimeline).mockImplementationOnce((inputs) =>
        original({ ...inputs, trials: SMALL_TRIALS }),
    );
}

function provide(
    state: CalculatorState,
    base: ProviderHarness['base'] = PENDING_BASE,
) {
    harness.current = {
        base,
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

async function setNumberInput(
    container: HTMLElement,
    id: string,
    value: string,
): Promise<void> {
    const input = container.querySelector(`#${id}`);
    if (input === null) throw new Error(`expected an input with id ${id}`);
    await act(async () => {
        Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value',
        )?.set?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
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
        vi.stubGlobal('Worker', InlineToolsWorker);
        vi.mocked(simulate).mockClear();
        vi.mocked(simulatePortfolio).mockClear();
        vi.mocked(simulatePortfolioTimeline).mockClear();
        resolverRuns.count = 0;
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

        it('the simulator page shows a failure message, not a skeleton, when a run for the current inputs gave no result', () => {
            provide(stateWith({}), FAILED_BASE);
            render(<SimulatorView />);
            expect(notices()).toEqual([BASE_FAILURE_TEXT, BASE_FAILURE_TEXT]);
            expect(container.querySelector('.animate-pulse')).toBeNull();
        });

        it('the analysis page shows a failure message in every base result section when a run gave no result', () => {
            provide(stateWith({}), FAILED_BASE);
            render(<AnalysisView />);
            expect(notices()).toEqual([
                BASE_FAILURE_TEXT,
                BASE_FAILURE_TEXT,
                BASE_FAILURE_TEXT,
                BASE_FAILURE_TEXT,
            ]);
        });

        it('the simulator page shows the skeleton, not the last run error, while newer inputs are pending (PT-11g)', () => {
            provide(stateWith({}), {
                error: 'simulate: an error from the previous inputs',
                isPending: true,
                result: null,
            });
            render(<SimulatorView />);
            expect(notices()).toEqual([]);
            expect(container.querySelector('.animate-pulse')).not.toBeNull();
        });

        it('the analysis page shows the engine error of the current run in every base result section (PT-11g)', () => {
            const message = 'simulate: trials must be a positive safe integer';
            provide(stateWith({}), {
                error: message,
                isPending: false,
                result: null,
            });
            render(<AnalysisView />);
            expect(notices()).toEqual([message, message, message, message]);
        });

        it('the analysis page still shows the skeleton while the default inputs are pending', () => {
            provide(stateWith({}));
            render(<AnalysisView />);
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

        it('PortfolioPanel counts only the simulated rows in its account totals', () => {
            const state = stateWith({ riskDollars: 150 });
            provide(state);
            const [apex] = state.portfolio;
            if (apex === undefined) throw new Error('default portfolio row');
            const portfolio: PortfolioEntry[] = [
                { ...apex, count: 2, id: 'accepted-a' },
                { ...apex, count: 1, id: 'accepted-b' },
                {
                    ...apex,
                    count: 3,
                    id: 'refused-row',
                    instrument: InstrumentSymbol.NQ,
                    stopPoints: 10,
                },
            ];
            render(
                <PortfolioPanel
                    baseInputs={buildSimInputs(state)}
                    currentFirm={state.firm}
                    currentPlan={state.plan}
                    firms={ALL_FIRMS}
                    onPortfolioChange={vi.fn()}
                    planOptIns={NO_OPT_INS}
                    portfolio={portfolio}
                />,
            );
            expect(simulate).toHaveBeenCalledTimes(2);
            const accountsCard = [...container.querySelectorAll('p')]
                .find((node) => node.textContent === 'Total accounts')
                ?.closest('.px-3');
            expect(accountsCard?.querySelector('.font-mono')?.textContent).toBe(
                '3',
            );
            expect(container.textContent).toContain('Total (3 accounts)');
            expect(container.textContent).not.toContain('Total (6 accounts)');
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
                    labLink={{ status: LabLinkStatus.Absent }}
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

        it('CashFlowPanel runs no timeline and shows the refusal for NQ at a 10 point stop and $150 (PT-11g)', () => {
            const state = refusedState();
            provide(state);
            const inputs = buildSimInputs(state);
            render(
                <CashFlowPanel
                    baseInputs={inputs}
                    firmDisplayName={state.firm.displayName}
                    maxAccounts={5}
                />,
            );
            expect(simulatePortfolioTimeline).not.toHaveBeenCalled();
            expect(notices()).toEqual([requiredIssue(inputs)]);
            expect(container.textContent).not.toContain('Computing cash flow');
            expect(container.textContent).not.toContain('Median final net');
            expect(container.textContent).not.toContain('P(ever break-even)');
        });

        it('CashFlowPanel places one NQ contract at a 10 point stop and $200 (PT-11g)', () => {
            const state = stateWith({
                instrument: InstrumentSymbol.NQ,
                riskDollars: 200,
                stopPoints: 10,
            });
            provide(state);
            limitTimelineTrials();
            render(
                <CashFlowPanel
                    baseInputs={buildSimInputs(state)}
                    firmDisplayName={state.firm.displayName}
                    maxAccounts={5}
                />,
            );
            expect(simulatePortfolioTimeline).toHaveBeenCalledTimes(1);
            expect(
                vi.mocked(simulatePortfolioTimeline).mock.calls[0]?.[0],
            ).toMatchObject({
                instrument: InstrumentSymbol.NQ,
                riskPerTrade: 200,
                stopPoints: 10,
            });
            expect(notices()).toEqual([]);
        });

        it('CashFlowPanel keeps the default inputs (stop points off) free of position sizing (PT-11g)', () => {
            const state = stateWith({});
            provide(state);
            limitTimelineTrials();
            render(
                <CashFlowPanel
                    baseInputs={buildSimInputs(state)}
                    firmDisplayName={state.firm.displayName}
                    maxAccounts={5}
                />,
            );
            expect(simulatePortfolioTimeline).toHaveBeenCalledTimes(1);
            const [timelineInputs] =
                vi.mocked(simulatePortfolioTimeline).mock.calls[0] ?? [];
            expect(timelineInputs?.stopPoints).toBeUndefined();
            expect(notices()).toEqual([]);
        });

        it('CashFlowPanel shows P(ends net negative) next to P10 final net (PT-62b, F-V14)', () => {
            const state = stateWith({});
            provide(state);
            limitTimelineTrials();
            render(
                <CashFlowPanel
                    baseInputs={buildSimInputs(state)}
                    firmDisplayName={state.firm.displayName}
                    maxAccounts={5}
                />,
            );
            expect(container.textContent).toContain('P(ends net negative)');
            const card = [...container.querySelectorAll('span')]
                .find((node) => node.textContent === 'P(ends net negative)')
                ?.closest('.px-3');
            expect(card?.querySelector('.font-mono')?.textContent).toMatch(
                /^\d+\.\d%$/,
            );
        });

        it('does not apply an undisclosed 0.5 red/green threshold to P(ends net negative), matching the neutral treatment of the same figure on ProjectionCard (PT-62b review HIGH fix)', () => {
            const state = stateWith({});
            provide(state);
            limitTimelineTrials();
            render(
                <CashFlowPanel
                    baseInputs={buildSimInputs(state)}
                    firmDisplayName={state.firm.displayName}
                    maxAccounts={5}
                />,
            );
            const card = [...container.querySelectorAll('span')]
                .find((node) => node.textContent === 'P(ends net negative)')
                ?.closest('.px-3');
            const valueSpan = card?.querySelector('.font-mono');
            expect(valueSpan?.className).not.toContain('text-rose-400');
            expect(valueSpan?.className).not.toContain('text-emerald-400');
        });

        describe('the funnel what-if form (PT-62b, F-V11)', () => {
            it('computes through funnelWhatIf once every field is a valid number', async () => {
                const state = stateWith({});
                provide(state);
                limitTimelineTrials();
                render(
                    <CashFlowPanel
                        baseInputs={buildSimInputs(state)}
                        firmDisplayName={state.firm.displayName}
                        maxAccounts={5}
                    />,
                );
                const expected = funnelWhatIf({
                    attemptCost: dollars(165),
                    attempts: 100,
                    averagePayout: dollars(2000),
                    passProbability: fraction(0.6),
                    payoutProbabilityGivenFunded: fraction(0.5),
                }).value;
                if (expected === null)
                    throw new Error('expected a funnel result');

                await setNumberInput(
                    container,
                    'cash-flow-what-if-attempts',
                    '100',
                );
                await setNumberInput(
                    container,
                    'cash-flow-what-if-pass-rate',
                    '60',
                );
                await setNumberInput(
                    container,
                    'cash-flow-what-if-payout-rate',
                    '50',
                );
                await setNumberInput(
                    container,
                    'cash-flow-what-if-average-payout',
                    '2000',
                );
                await setNumberInput(
                    container,
                    'cash-flow-what-if-attempt-cost',
                    '165',
                );

                expect(container.textContent).toContain(
                    formatCompactCurrency(expected.net),
                );
                expect(container.textContent).toContain(
                    formatCompactCurrency(expected.fees),
                );
                expect(container.textContent).toContain(
                    formatCompactCurrency(expected.payouts),
                );
            });

            it('states the one payout per paying account assumption and the funded value / attempt cost label under the result (PT-93, F-V11)', async () => {
                render(cashFlowPanelWithoutTimeline());
                expect(container.textContent).not.toContain(
                    ECONOMICS_DISCLOSURE_TEXT[
                        EconomicsDisclosure.OnePayoutPerPayingAccount
                    ],
                );
                await fillWhatIf(container, '60');
                expect(container.textContent).toContain(
                    ECONOMICS_DISCLOSURE_TEXT[
                        EconomicsDisclosure.OnePayoutPerPayingAccount
                    ],
                );
                expect(container.textContent).toContain(
                    fundedValueToAttemptCostLabel(1000 / 165 - 1),
                );
            });

            it('shows neither the assumption nor the ratio label while the form is invalid (PT-93, F-V11)', async () => {
                render(cashFlowPanelWithoutTimeline());
                await fillWhatIf(container, '160');
                expect(container.textContent).toContain(
                    'enter a valid pass rate',
                );
                expect(container.textContent).not.toContain(
                    ECONOMICS_DISCLOSURE_TEXT[
                        EconomicsDisclosure.OnePayoutPerPayingAccount
                    ],
                );
                expect(container.textContent).not.toContain(
                    'funded value / attempt cost',
                );
            });

            it('validates the what-if fields through the react-hook-form Zod resolver (PT-93 review)', async () => {
                render(cashFlowPanelWithoutTimeline());
                const runsBefore = resolverRuns.count;
                await fillWhatIf(container, '160');
                expect(resolverRuns.count).toBeGreaterThan(runsBefore);
                expect(container.textContent).toContain(
                    'enter a valid pass rate',
                );
                await setNumberInput(
                    container,
                    'cash-flow-what-if-pass-rate',
                    '60',
                );
                expect(container.textContent).not.toContain(
                    'enter a valid pass rate',
                );
                expect(container.textContent).toContain(
                    ECONOMICS_DISCLOSURE_TEXT[
                        EconomicsDisclosure.OnePayoutPerPayingAccount
                    ],
                );
            });

            it('does not re-render the cash flow timeline panel while the what-if fields are typed into (PT-93 review)', async () => {
                render(cashFlowPanelWithoutTimeline());
                const rendersBefore = vi.mocked(useCashFlowSimulation).mock
                    .calls.length;
                await fillWhatIf(container, '60');
                expect(container.textContent).toContain(
                    ECONOMICS_DISCLOSURE_TEXT[
                        EconomicsDisclosure.OnePayoutPerPayingAccount
                    ],
                );
                expect(
                    vi.mocked(useCashFlowSimulation).mock.calls,
                ).toHaveLength(rendersBefore);
            });

            it('shows a validation message and no computed result for an out-of-range field, without crashing', async () => {
                const state = stateWith({});
                provide(state);
                limitTimelineTrials();
                render(
                    <CashFlowPanel
                        baseInputs={buildSimInputs(state)}
                        firmDisplayName={state.firm.displayName}
                        maxAccounts={5}
                    />,
                );
                await setNumberInput(
                    container,
                    'cash-flow-what-if-attempts',
                    '100',
                );
                await setNumberInput(
                    container,
                    'cash-flow-what-if-pass-rate',
                    '160',
                );
                await setNumberInput(
                    container,
                    'cash-flow-what-if-payout-rate',
                    '50',
                );
                await setNumberInput(
                    container,
                    'cash-flow-what-if-average-payout',
                    '2000',
                );
                await setNumberInput(
                    container,
                    'cash-flow-what-if-attempt-cost',
                    '165',
                );

                expect(container.textContent).toContain(
                    'enter a valid pass rate, payout rate, attempts, average payout and attempt cost',
                );
            });

            it('wires the validation message to every what-if field via aria-describedby and aria-invalid (PT-62b review MEDIUM fix)', async () => {
                const state = stateWith({});
                provide(state);
                limitTimelineTrials();
                render(
                    <CashFlowPanel
                        baseInputs={buildSimInputs(state)}
                        firmDisplayName={state.firm.displayName}
                        maxAccounts={5}
                    />,
                );
                await setNumberInput(
                    container,
                    'cash-flow-what-if-attempts',
                    '100',
                );
                await setNumberInput(
                    container,
                    'cash-flow-what-if-pass-rate',
                    '160',
                );
                await setNumberInput(
                    container,
                    'cash-flow-what-if-payout-rate',
                    '50',
                );
                await setNumberInput(
                    container,
                    'cash-flow-what-if-average-payout',
                    '2000',
                );
                await setNumberInput(
                    container,
                    'cash-flow-what-if-attempt-cost',
                    '165',
                );

                const message = container.querySelector(
                    '#cash-flow-what-if-validation-message',
                );
                expect(message).not.toBeNull();

                for (const id of [
                    'cash-flow-what-if-attempts',
                    'cash-flow-what-if-pass-rate',
                    'cash-flow-what-if-payout-rate',
                    'cash-flow-what-if-average-payout',
                    'cash-flow-what-if-attempt-cost',
                ]) {
                    const field = container.querySelector(`#${id}`);
                    expect(field?.getAttribute('aria-describedby')).toBe(
                        'cash-flow-what-if-validation-message',
                    );
                    expect(field?.getAttribute('aria-invalid')).toBe('true');
                }
            });

            it('rounds attempt cost and average payout down to whole cents before computing, matching every other dollar field on the page (PT-62b review MEDIUM fix)', () => {
                const rounded = funnelWhatIfFromForm({
                    attemptCost: '165.999',
                    attempts: '100',
                    averagePayout: '2000.006',
                    passRate: '60',
                    payoutRate: '50',
                });
                const flooredDirectly = funnelWhatIfFromForm({
                    attemptCost: '165.99',
                    attempts: '100',
                    averagePayout: '2000',
                    passRate: '60',
                    payoutRate: '50',
                });
                expect(rounded).not.toBeNull();
                expect(flooredDirectly).not.toBeNull();
                expect(rounded?.result).toBeDefined();
                expect(rounded?.result).toEqual(flooredDirectly?.result);
            });
        });
    });
});
