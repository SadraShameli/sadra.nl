import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as UseToolsWorkerModule from '~/app/(app)/prop-calculator/_components/useToolsWorker';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import {
    ToolsRequestKind,
    ToolsResponseKind,
} from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { BankrollLeverKind } from '~/lib/prop-calculator/economics';
import { type SimOutputs } from '~/lib/prop-calculator/simulator';

const currentState = vi.hoisted(() => ({
    isPending: false,
    result: null as null | SimOutputs,
}));

const toolsWorkerBox = vi.hoisted(() => ({
    instances: [] as {
        runSpy: (request: unknown) => void;
        setState: (state: unknown) => void;
    }[],
}));

vi.mock('next/navigation', () => ({
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock('~/lib/auth/client', () => ({
    useSession: () => ({ data: null, error: null, isPending: false }),
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            bankroll: {
                summary: { useQuery: () => ({ data: undefined }) },
            },
            rulebook: {
                get: { useQuery: () => ({ data: undefined }) },
            },
        },
    },
}));

vi.mock('~/app/(app)/prop-calculator/_components/ToolPageHeading', () => ({
    ToolPageHeading: () => null,
}));

vi.mock('~/app/(app)/prop-calculator/_components/InputsSummary', () => ({
    InputsSummary: () => null,
}));

vi.mock('~/app/(app)/prop-calculator/_components/CalculatorProvider', () => ({
    useBaseResult: () => ({
        error: null,
        isPending: currentState.isPending,
        result: currentState.result,
    }),
    useCalculatorInputs: () => ({ state: defaultCalculatorState() }),
}));

vi.mock('~/app/(app)/prop-calculator/_components/useToolsWorker', async (importOriginal) => {
    const React = await import('react');
    const actual = await importOriginal<typeof UseToolsWorkerModule>();
    return {
        ToolsWorkerPhase: actual.ToolsWorkerPhase,
        useToolsWorker: () => {
            const [state, setState] = React.useState<unknown>({
                phase: actual.ToolsWorkerPhase.Idle,
            });
            const indexReference = React.useRef<null | number>(null);
            if (indexReference.current === null) {
                indexReference.current = toolsWorkerBox.instances.length;
                toolsWorkerBox.instances.push({
                    runSpy: vi.fn(),
                    setState,
                });
            }
            const instance = toolsWorkerBox.instances[indexReference.current];
            return {
                cancel: vi.fn(),
                run: (request: unknown) => {
                    instance?.runSpy(request);
                },
                state,
            };
        },
    };
});

const { BankrollView } = await import(
    '~/app/(app)/prop-calculator/(tools)/bankroll/BankrollView'
);
const { ToolsWorkerPhase: RealToolsWorkerPhase } = await import(
    '~/app/(app)/prop-calculator/_components/useToolsWorker'
);

function fakeSimOutputs(): SimOutputs {
    return {
        attemptPassProbability: 0.6,
        attemptPaysProbability: 0.3,
        costPerAttempt: 165,
        estimates: {
            attemptPassProbability: { standardError: 0.01 },
            attemptPaysProbability: { standardError: 0.01 },
            expectedMonthlyNet: { standardError: 20 },
            expectedNetPerAttempt: { standardError: 5 },
        },
        expectedNetPerAttempt: 45,
        netValues: [900, -165, -165, -165, 1400, -165, -165, -165],
    } as unknown as SimOutputs;
}

function requireInput(element: Element | null): HTMLInputElement {
    if (element === null) throw new Error('expected the input to exist');
    return element as HTMLInputElement;
}

function setInputValue(input: HTMLInputElement, value: string): void {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(
        input,
        value,
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('BankrollView (PT-62a): no video figure renders unless the user typed the inputs', () => {
    let root: Root;
    let container: HTMLElement;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        toolsWorkerBox.instances = [];
        currentState.isPending = false;
        currentState.result = fakeSimOutputs();
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        vi.unstubAllGlobals();
    });

    it('renders none of the video figures (150000, 214375, 3.5) by default', () => {
        act(() => {
            root.render(<BankrollView />);
        });
        expect(container.textContent).not.toContain('150,000');
        expect(container.textContent).not.toContain('150000');
        expect(container.textContent).not.toContain('214,375');
        expect(container.textContent).not.toContain('214375');
        expect(container.textContent).not.toContain('3.5x');
    });

    it('shows no attempts-affordable, batch or projection figures before the user enters a budget or a starting bankroll', () => {
        act(() => {
            root.render(<BankrollView />);
        });
        expect(container.textContent).toContain('Enter a starting bankroll and a horizon to project.');
        const budgetInput = container.querySelector('#bankroll-budget');
        expect(budgetInput).not.toBeNull();
        expect((budgetInput as HTMLInputElement).value).toBe('');
        const startInput = container.querySelector('#bankroll-start');
        expect((startInput as HTMLInputElement).value).toBe('');
    });

    it('shows the plan-level attempt cost and P(attempt pays) even with no budget typed (not a video figure)', () => {
        act(() => {
            root.render(<BankrollView />);
        });
        expect(container.textContent).toContain('Attempt cost');
        expect(container.textContent).toContain('P(attempt pays)');
    });

    it('requests a Batch price once a budget is typed, and shows the worker result once it succeeds', () => {
        act(() => {
            root.render(<BankrollView />);
        });
        const budgetInput = requireInput(container.querySelector('#bankroll-budget'));
        act(() => {
            setInputValue(budgetInput, '5000');
        });

        const setupInstance = toolsWorkerBox.instances[0];
        expect(setupInstance).toBeDefined();
        const runSpy = vi.fn();
        if (setupInstance) setupInstance.runSpy = runSpy;

        act(() => {
            setInputValue(budgetInput, '5000');
        });

        act(() => {
            setInputValue(budgetInput, '4000');
        });
        expect(runSpy).toHaveBeenCalled();
        const [request] = runSpy.mock.calls.at(-1) as [{ kind: ToolsRequestKind; runId: number }];
        expect(request.kind).toBe(ToolsRequestKind.Batch);

        act(() => {
            setupInstance?.setState({
                phase: RealToolsWorkerPhase.Succeeded,
                result: {
                    kind: ToolsResponseKind.Batch,
                    result: {
                        crossCheckLossProbability: 0.22,
                        fundedValueToAttemptCostRatio: 1.7,
                        lossProbability: 0.18,
                        lossProbabilityReason: null,
                        lossProbabilityStandardError: 0.02,
                        meanNet: 320,
                    },
                    runId: request.runId,
                },
            });
        });

        expect(container.textContent).toContain('18.0%');
    });

    it('never renders a closed-form projection figure without its label', () => {
        act(() => {
            root.render(<BankrollView />);
        });
        const startInput = requireInput(container.querySelector('#bankroll-start'));
        const horizonInput = requireInput(container.querySelector('#bankroll-horizon'));
        const reinvestInput = requireInput(container.querySelector('#bankroll-reinvest'));
        act(() => {
            setInputValue(startInput, '5000');
        });
        act(() => {
            setInputValue(horizonInput, '180');
        });
        act(() => {
            setInputValue(reinvestInput, '1');
        });

        expect(container.textContent).toContain(
            'deterministic illustration, not a forecast',
        );
        const projectionInstance = toolsWorkerBox.instances[1];
        expect(projectionInstance).toBeDefined();

        act(() => {
            projectionInstance?.setState({
                phase: RealToolsWorkerPhase.Succeeded,
                result: {
                    kind: ToolsResponseKind.Projection,
                    result: {
                        cardsBoughtP50: 2,
                        cashP10: [5000, 4000],
                        cashP50: [5000, 7000],
                        cashP90: [5000, 9000],
                        cumulativeSpendP10: [0, 495],
                        cumulativeSpendP50: [0, 495],
                        cumulativeSpendP90: [0, 495],
                        days: [0, 180],
                        measuredCycleDays: 42,
                        pathRuin: 0.05,
                        payoutP10: [0, 0],
                        payoutP50: [0, 0],
                        payoutP90: [0, 0],
                        pFinalNetNegative: 0.1,
                        withdrawnP10: [0, 0],
                        withdrawnP50: [0, 0],
                        withdrawnP90: [0, 0],
                    },
                    runId: 1,
                },
            });
        });

        expect(container.textContent).toContain('1.40x');
        expect(container.textContent).toContain(
            'deterministic illustration, not a forecast',
        );
    });

    it('shows the worker failure reason on the Setup card instead of a bare n/a when the Batch request fails', () => {
        act(() => {
            root.render(<BankrollView />);
        });
        const budgetInput = requireInput(container.querySelector('#bankroll-budget'));
        act(() => {
            setInputValue(budgetInput, '5000');
        });

        const setupInstance = toolsWorkerBox.instances[0];
        expect(setupInstance).toBeDefined();

        act(() => {
            setupInstance?.setState({
                phase: RealToolsWorkerPhase.Failed,
                reason: 'toolsWorker: no plan for the requested firm and serial',
            });
        });

        expect(container.textContent).toContain(
            'toolsWorker: no plan for the requested firm and serial',
        );
        expect(
            container.querySelector('[role="alert"]')?.textContent,
        ).toBe('toolsWorker: no plan for the requested firm and serial');
    });

    it('shows the worker failure reason on the Projection card instead of the generic empty-input copy once inputs are filled', () => {
        act(() => {
            root.render(<BankrollView />);
        });
        const startInput = requireInput(container.querySelector('#bankroll-start'));
        const horizonInput = requireInput(container.querySelector('#bankroll-horizon'));
        act(() => {
            setInputValue(startInput, '5000');
        });
        act(() => {
            setInputValue(horizonInput, '180');
        });

        const projectionInstance = toolsWorkerBox.instances[1];
        expect(projectionInstance).toBeDefined();

        act(() => {
            projectionInstance?.setState({
                phase: RealToolsWorkerPhase.Failed,
                reason: 'toolsWorker: no plan for the requested firm and serial',
            });
        });

        expect(container.textContent).toContain(
            'toolsWorker: no plan for the requested firm and serial',
        );
        expect(container.textContent).not.toContain(
            'Enter a starting bankroll and a horizon to project.',
        );
        expect(
            container.querySelector('[role="alert"]')?.textContent,
        ).toBe('toolsWorker: no plan for the requested firm and serial');
    });

    it('clears the Setup card failure banner once the budget is cleared, since no request is current (PT-62a LOW)', () => {
        act(() => {
            root.render(<BankrollView />);
        });
        const budgetInput = requireInput(container.querySelector('#bankroll-budget'));
        act(() => {
            setInputValue(budgetInput, '5000');
        });

        const setupInstance = toolsWorkerBox.instances[0];
        expect(setupInstance).toBeDefined();

        act(() => {
            setupInstance?.setState({
                phase: RealToolsWorkerPhase.Failed,
                reason: 'toolsWorker: no plan for the requested firm and serial',
            });
        });
        expect(container.textContent).toContain(
            'toolsWorker: no plan for the requested firm and serial',
        );

        act(() => {
            setInputValue(budgetInput, '');
        });

        expect(container.textContent).not.toContain(
            'toolsWorker: no plan for the requested firm and serial',
        );
    });

    it('does not request a Batch price while the base simulation has not caught up to the latest inputs (isPending)', () => {
        act(() => {
            root.render(<BankrollView />);
        });
        const budgetInput = requireInput(container.querySelector('#bankroll-budget'));
        act(() => {
            setInputValue(budgetInput, '5000');
        });

        const setupInstance = toolsWorkerBox.instances[0];
        expect(setupInstance).toBeDefined();

        currentState.isPending = true;
        const runSpy = vi.fn();
        if (setupInstance) setupInstance.runSpy = runSpy;

        act(() => {
            setInputValue(budgetInput, '6000');
        });

        expect(runSpy).not.toHaveBeenCalled();
    });

    it('keeps the raw characters typed into a Projection number field even while they parse to nothing', () => {
        act(() => {
            root.render(<BankrollView />);
        });
        const horizonInput = requireInput(container.querySelector('#bankroll-horizon'));
        act(() => {
            setInputValue(horizonInput, '-1');
        });
        expect(horizonInput.value).toBe('-1');
    });

    it('does not double-fire the projection request when run() itself triggers a Running re-render', () => {
        act(() => {
            root.render(<BankrollView />);
        });
        act(() => {
            setInputValue(requireInput(container.querySelector('#bankroll-start')), '5000');
        });

        const instance = toolsWorkerBox.instances[1];
        expect(instance).toBeDefined();
        let calls = 0;
        const runSpy = vi.fn(() => {
            calls += 1;
            if (calls === 1) {
                instance?.setState({ phase: RealToolsWorkerPhase.Running });
            }
        });
        if (instance) instance.runSpy = runSpy;

        act(() => {
            setInputValue(requireInput(container.querySelector('#bankroll-horizon')), '180');
        });

        expect(runSpy).toHaveBeenCalledTimes(1);
    });

    describe('TwoStrategiesCard (PT-62b)', () => {
        it('requests a TwoStrategies price once both strategies and a start/horizon are typed, labels the alternate risk as a what-if, and renders both bands', () => {
            act(() => {
                root.render(<BankrollView />);
            });
            act(() => {
                setInputValue(
                    requireInput(container.querySelector('#bankroll-two-strategies-start')),
                    '5000',
                );
            });
            act(() => {
                setInputValue(
                    requireInput(container.querySelector('#bankroll-two-strategies-horizon')),
                    '180',
                );
            });
            act(() => {
                setInputValue(
                    requireInput(container.querySelector('#bankroll-two-strategies-reinvest')),
                    '1',
                );
            });
            act(() => {
                setInputValue(
                    requireInput(container.querySelector('#bankroll-two-strategies-risk-b')),
                    '500',
                );
            });

            expect(container.textContent).toContain(
                'what-if: conflicts with Hard Rule 3',
            );

            const instance = toolsWorkerBox.instances[2];
            expect(instance).toBeDefined();
            const runSpy = vi.fn();
            if (instance) instance.runSpy = runSpy;
            act(() => {
                setInputValue(
                    requireInput(container.querySelector('#bankroll-two-strategies-risk-b')),
                    '600',
                );
            });
            expect(runSpy).toHaveBeenCalled();
            const [request] = runSpy.mock.calls.at(-1) as [
                { kind: ToolsRequestKind; runId: number },
            ];
            expect(request.kind).toBe(ToolsRequestKind.TwoStrategies);

            act(() => {
                instance?.setState({
                    phase: RealToolsWorkerPhase.Succeeded,
                    result: {
                        kind: ToolsResponseKind.TwoStrategies,
                        results: [
                            {
                                cardsBoughtP50: 2,
                                cashP10: [5000, 4000],
                                cashP50: [5000, 6000],
                                cashP90: [5000, 8000],
                                cumulativeSpendP10: [0, 500],
                                cumulativeSpendP50: [0, 500],
                                cumulativeSpendP90: [0, 500],
                                days: [0, 180],
                                measuredCycleDays: 42,
                                pathRuin: 0.05,
                                payoutP10: [0, 0],
                                payoutP50: [0, 0],
                                payoutP90: [0, 0],
                                pFinalNetNegative: 0.1,
                                withdrawnP10: [0, 0],
                                withdrawnP50: [0, 0],
                                withdrawnP90: [0, 0],
                            },
                            {
                                cardsBoughtP50: 3,
                                cashP10: [5000, 4500],
                                cashP50: [5000, 9000],
                                cashP90: [5000, 12_000],
                                cumulativeSpendP10: [0, 800],
                                cumulativeSpendP50: [0, 800],
                                cumulativeSpendP90: [0, 800],
                                days: [0, 180],
                                measuredCycleDays: 30,
                                pathRuin: 0.12,
                                payoutP10: [0, 0],
                                payoutP50: [0, 0],
                                payoutP90: [0, 0],
                                pFinalNetNegative: 0.2,
                                withdrawnP10: [0, 0],
                                withdrawnP50: [0, 0],
                                withdrawnP90: [0, 0],
                            },
                        ],
                        runId: request.runId,
                    },
                });
            });

            expect(container.textContent).toContain('1.20x');
            expect(container.textContent).toContain('1.80x');
            expect(container.textContent).toContain(
                'deterministic illustration, not a forecast',
            );
        });

        it('does not double-fire the worker request when run() itself triggers a Running re-render (PT-62b CRITICAL runId-in-key fix)', () => {
            act(() => {
                root.render(<BankrollView />);
            });
            act(() => {
                setInputValue(
                    requireInput(container.querySelector('#bankroll-two-strategies-start')),
                    '5000',
                );
            });
            act(() => {
                setInputValue(
                    requireInput(container.querySelector('#bankroll-two-strategies-horizon')),
                    '180',
                );
            });

            const instance = toolsWorkerBox.instances[2];
            expect(instance).toBeDefined();
            let calls = 0;
            const runSpy = vi.fn(() => {
                calls += 1;
                if (calls === 1) {
                    instance?.setState({ phase: RealToolsWorkerPhase.Running });
                }
            });
            if (instance) instance.runSpy = runSpy;

            act(() => {
                setInputValue(
                    requireInput(container.querySelector('#bankroll-two-strategies-risk-b')),
                    '500',
                );
            });

            expect(runSpy).toHaveBeenCalledTimes(1);
        });

        it('wires the Strategy B conflict disclosure to the risk-b field via aria-describedby (PT-62b review MEDIUM fix)', () => {
            act(() => {
                root.render(<BankrollView />);
            });
            const riskBInput = requireInput(
                container.querySelector('#bankroll-two-strategies-risk-b'),
            );
            expect(riskBInput.getAttribute('aria-describedby')).toBeNull();

            act(() => {
                setInputValue(riskBInput, '500');
            });

            const message = container.querySelector(
                '#bankroll-two-strategies-risk-b-conflict',
            );
            expect(message).not.toBeNull();
            expect(riskBInput.getAttribute('aria-describedby')).toBe(
                'bankroll-two-strategies-risk-b-conflict',
            );
        });
    });

    describe('BatchCard (PT-62b)', () => {
        it('requests a Batch price for a user-typed attempt count and shows the EV, funded-value ratio and the binomial cross-check', () => {
            act(() => {
                root.render(<BankrollView />);
            });
            act(() => {
                setInputValue(
                    requireInput(container.querySelector('#bankroll-batch-attempts')),
                    '40',
                );
            });

            const instance = toolsWorkerBox.instances[3];
            expect(instance).toBeDefined();
            const runSpy = vi.fn();
            if (instance) instance.runSpy = runSpy;
            act(() => {
                setInputValue(
                    requireInput(container.querySelector('#bankroll-batch-attempts')),
                    '41',
                );
            });
            expect(runSpy).toHaveBeenCalled();
            const [request] = runSpy.mock.calls.at(-1) as [
                { attempts: number; kind: ToolsRequestKind; runId: number },
            ];
            expect(request.kind).toBe(ToolsRequestKind.Batch);
            expect(request.attempts).toBe(41);

            act(() => {
                instance?.setState({
                    phase: RealToolsWorkerPhase.Succeeded,
                    result: {
                        kind: ToolsResponseKind.Batch,
                        result: {
                            crossCheckLossProbability: 0.22,
                            fundedValueToAttemptCostRatio: 1.7,
                            lossProbability: 0.18,
                            lossProbabilityReason: null,
                            lossProbabilityStandardError: 0.02,
                            meanNet: 320,
                        },
                        runId: request.runId,
                    },
                });
            });

            expect(container.textContent).toContain('18.0%');
            expect(container.textContent).toContain('22.0%');
            expect(container.textContent).toContain('1.70');
        });

        it('does not double-fire the worker request when run() itself triggers a Running re-render (PT-62b CRITICAL runId-in-key fix)', () => {
            act(() => {
                root.render(<BankrollView />);
            });
            act(() => {
                setInputValue(
                    requireInput(container.querySelector('#bankroll-batch-attempts')),
                    '40',
                );
            });

            const instance = toolsWorkerBox.instances[3];
            expect(instance).toBeDefined();
            let calls = 0;
            const runSpy = vi.fn(() => {
                calls += 1;
                if (calls === 1) {
                    instance?.setState({ phase: RealToolsWorkerPhase.Running });
                }
            });
            if (instance) instance.runSpy = runSpy;

            act(() => {
                setInputValue(
                    requireInput(container.querySelector('#bankroll-batch-attempts')),
                    '41',
                );
            });

            expect(runSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('SameEvCard (PT-62b)', () => {
        it('requests a SameEv price for two risk levels and shows EV, P(no payout) and loss risk side by side', () => {
            act(() => {
                root.render(<BankrollView />);
            });
            act(() => {
                setInputValue(
                    requireInput(container.querySelector('#bankroll-same-ev-bankroll')),
                    '5000',
                );
            });
            act(() => {
                setInputValue(
                    requireInput(container.querySelector('#bankroll-same-ev-risk-b')),
                    '500',
                );
            });

            const instance = toolsWorkerBox.instances[4];
            expect(instance).toBeDefined();
            const runSpy = vi.fn();
            if (instance) instance.runSpy = runSpy;
            act(() => {
                setInputValue(
                    requireInput(container.querySelector('#bankroll-same-ev-risk-b')),
                    '600',
                );
            });
            expect(runSpy).toHaveBeenCalled();
            const [request] = runSpy.mock.calls.at(-1) as [
                { kind: ToolsRequestKind; runId: number },
            ];
            expect(request.kind).toBe(ToolsRequestKind.SameEv);

            act(() => {
                instance?.setState({
                    phase: RealToolsWorkerPhase.Succeeded,
                    result: {
                        kind: ToolsResponseKind.SameEv,
                        results: [
                            {
                                evPerAttempt: 45,
                                evPerAttemptStandardError: 5,
                                lossRisk: 0.12,
                                noPayoutProbability: 0.08,
                            },
                            {
                                evPerAttempt: 44,
                                evPerAttemptStandardError: 6,
                                lossRisk: 0.15,
                                noPayoutProbability: 0.09,
                            },
                        ],
                        runId: request.runId,
                    },
                });
            });

            expect(container.textContent).toContain('$45');
            expect(container.textContent).toContain('$44');
            expect(container.textContent).toContain('12.0%');
            expect(container.textContent).toContain('15.0%');
        });

        it('does not double-fire the worker request when run() itself triggers a Running re-render (PT-62b CRITICAL runId-in-key fix)', () => {
            act(() => {
                root.render(<BankrollView />);
            });
            act(() => {
                setInputValue(
                    requireInput(container.querySelector('#bankroll-same-ev-bankroll')),
                    '5000',
                );
            });
            act(() => {
                setInputValue(
                    requireInput(container.querySelector('#bankroll-same-ev-risk-b')),
                    '500',
                );
            });

            const instance = toolsWorkerBox.instances[4];
            expect(instance).toBeDefined();
            let calls = 0;
            const runSpy = vi.fn(() => {
                calls += 1;
                if (calls === 1) {
                    instance?.setState({ phase: RealToolsWorkerPhase.Running });
                }
            });
            if (instance) instance.runSpy = runSpy;

            act(() => {
                setInputValue(
                    requireInput(container.querySelector('#bankroll-same-ev-risk-b')),
                    '600',
                );
            });

            expect(runSpy).toHaveBeenCalledTimes(1);
        });

        it('wires the Strategy B conflict disclosure to the risk-b field via aria-describedby (PT-62b review MEDIUM fix)', () => {
            act(() => {
                root.render(<BankrollView />);
            });
            const riskBInput = requireInput(
                container.querySelector('#bankroll-same-ev-risk-b'),
            );
            expect(riskBInput.getAttribute('aria-describedby')).toBeNull();

            act(() => {
                setInputValue(riskBInput, '500');
            });

            const message = container.querySelector(
                '#bankroll-same-ev-risk-b-conflict',
            );
            expect(message).not.toBeNull();
            expect(riskBInput.getAttribute('aria-describedby')).toBe(
                'bankroll-same-ev-risk-b-conflict',
            );
        });
    });

    describe('LeversCard (PT-62b)', () => {
        it('requests Levers for the typed candidate lists and labels risk and trades-per-day rows as conflicting with Hard Rule 3', () => {
            act(() => {
                root.render(<BankrollView />);
            });
            act(() => {
                setInputValue(
                    requireInput(container.querySelector('#bankroll-levers-bankroll')),
                    '5000',
                );
            });
            act(() => {
                setInputValue(
                    requireInput(container.querySelector('#bankroll-levers-risks')),
                    '200,300',
                );
            });

            const instance = toolsWorkerBox.instances[5];
            expect(instance).toBeDefined();
            const runSpy = vi.fn();
            if (instance) instance.runSpy = runSpy;
            act(() => {
                setInputValue(
                    requireInput(container.querySelector('#bankroll-levers-risks')),
                    '200,300,400',
                );
            });
            expect(runSpy).toHaveBeenCalled();
            const [request] = runSpy.mock.calls.at(-1) as [
                {
                    kind: ToolsRequestKind;
                    risks: null | readonly number[];
                    runId: number;
                },
            ];
            expect(request.kind).toBe(ToolsRequestKind.Levers);
            expect(request.risks).toEqual([200, 300, 400]);

            act(() => {
                instance?.setState({
                    phase: RealToolsWorkerPhase.Succeeded,
                    result: {
                        kind: ToolsResponseKind.Levers,
                        rows: [
                            {
                                deltaEvPerAttempt: 0,
                                deltaMonthlyNet: 0,
                                deltaPassProbability: 0,
                                evPerAttempt: 45,
                                kind: BankrollLeverKind.Base,
                                label: null,
                                lossRisk: 0.18,
                                monthlyNet: 500,
                                passProbability: 0.6,
                                value: null,
                            },
                            {
                                deltaEvPerAttempt: 5,
                                deltaMonthlyNet: 40,
                                deltaPassProbability: 0.02,
                                evPerAttempt: 50,
                                kind: BankrollLeverKind.Risk,
                                label: 'what-if: conflicts with Hard Rule 3',
                                lossRisk: 0.2,
                                monthlyNet: 540,
                                passProbability: 0.62,
                                value: 300,
                            },
                        ],
                        runId: request.runId,
                    },
                });
            });

            expect(container.textContent).toContain(
                'what-if: conflicts with Hard Rule 3',
            );
            expect(container.textContent).toContain('$40');
            expect(container.textContent).toContain('20.0%');
        });

        it('formats a Risk row value as currency and a TradesPerDay row value as a plain count (PT-62b review MEDIUM fix)', () => {
            act(() => {
                root.render(<BankrollView />);
            });
            act(() => {
                setInputValue(
                    requireInput(container.querySelector('#bankroll-levers-bankroll')),
                    '5000',
                );
            });
            act(() => {
                setInputValue(
                    requireInput(container.querySelector('#bankroll-levers-risks')),
                    '200,300',
                );
            });

            const instance = toolsWorkerBox.instances[5];
            expect(instance).toBeDefined();

            act(() => {
                instance?.setState({
                    phase: RealToolsWorkerPhase.Succeeded,
                    result: {
                        kind: ToolsResponseKind.Levers,
                        rows: [
                            {
                                deltaEvPerAttempt: 5,
                                deltaMonthlyNet: 40,
                                deltaPassProbability: 0.02,
                                evPerAttempt: 50,
                                kind: BankrollLeverKind.Risk,
                                label: null,
                                lossRisk: 0.2,
                                monthlyNet: 540,
                                passProbability: 0.62,
                                value: 300,
                            },
                            {
                                deltaEvPerAttempt: 3,
                                deltaMonthlyNet: 20,
                                deltaPassProbability: 0.01,
                                evPerAttempt: 48,
                                kind: BankrollLeverKind.TradesPerDay,
                                label: null,
                                lossRisk: 0.19,
                                monthlyNet: 520,
                                passProbability: 0.61,
                                value: 2,
                            },
                        ],
                        runId: 1,
                    },
                });
            });

            const rows = [...container.querySelectorAll(':scope tbody tr')];
            const riskRow = rows.find((row) => row.textContent.startsWith('Risk'));
            const riskValueCell = riskRow?.querySelectorAll('td')[1];
            expect(riskValueCell?.textContent).toBe('$300');

            const tradesRow = rows.find((row) => row.textContent.startsWith('Trades per day'));
            const tradesValueCell = tradesRow?.querySelectorAll('td')[1];
            expect(tradesValueCell?.textContent).toBe('2');
        });

        it('does not double-fire the worker request when run() itself triggers a Running re-render (PT-62b CRITICAL runId-in-key fix)', () => {
            act(() => {
                root.render(<BankrollView />);
            });
            act(() => {
                setInputValue(
                    requireInput(container.querySelector('#bankroll-levers-bankroll')),
                    '5000',
                );
            });
            act(() => {
                setInputValue(
                    requireInput(container.querySelector('#bankroll-levers-risks')),
                    '200,300',
                );
            });

            const instance = toolsWorkerBox.instances[5];
            expect(instance).toBeDefined();
            let calls = 0;
            const runSpy = vi.fn(() => {
                calls += 1;
                if (calls === 1) {
                    instance?.setState({ phase: RealToolsWorkerPhase.Running });
                }
            });
            if (instance) instance.runSpy = runSpy;

            act(() => {
                setInputValue(
                    requireInput(container.querySelector('#bankroll-levers-risks')),
                    '200,300,400',
                );
            });

            expect(runSpy).toHaveBeenCalledTimes(1);
        });
    });
});
