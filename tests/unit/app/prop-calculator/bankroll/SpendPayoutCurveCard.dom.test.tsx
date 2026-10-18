import type * as Recharts from 'recharts';

import { act, cloneElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as UseToolsWorkerModule from '~/app/(app)/prop-calculator/_components/useToolsWorker';

import {
    type BankrollPlanVariantInputs,
    ToolsRequestKind,
    ToolsResponseKind,
} from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { FirmId, serializePlanId } from '~/lib/prop-calculator';
import {
    LifetimePayoutCapBasis,
    RebuyLagBasis,
} from '~/lib/prop-calculator/advisor';
import { TopStepVariant } from '~/lib/prop-calculator/core';
import { EconomicsReason } from '~/lib/prop-calculator/economics';

const toolsWorkerBox = vi.hoisted(() => ({
    instances: [] as {
        runSpy: ReturnType<typeof vi.fn<(request: unknown) => void>>;
        setState: (state: unknown) => void;
    }[],
}));

vi.mock('recharts', async (importOriginal) => {
    const actual = await importOriginal<typeof Recharts>();
    return {
        ...actual,
        ResponsiveContainer: ({ children }: { children: ReactElement }) =>
            cloneElement(children, { height: 200, width: 400 } as never),
    };
});

const variantBox = vi.hoisted(() => ({
    variant: null as BankrollPlanVariantInputs | null,
}));

vi.mock(
    '~/app/(app)/prop-calculator/_components/bankroll/useBankrollVariant',
    () => ({
        useBankrollVariant: () => ({
            rulebook: undefined,
            rulebookSource: undefined,
            variant: variantBox.variant,
        }),
    }),
);

vi.mock(
    '~/app/(app)/prop-calculator/_components/useToolsWorker',
    async (importOriginal) => {
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
                        runSpy: vi.fn<(request: unknown) => void>(),
                        setState,
                    });
                }
                const instance =
                    toolsWorkerBox.instances[indexReference.current];
                return {
                    cancel: vi.fn(),
                    run: (request: unknown) => {
                        instance?.runSpy(request);
                    },
                    state,
                };
            },
        };
    },
);

const { SpendPayoutCurveCard } =
    await import('~/app/(app)/prop-calculator/_components/bankroll/SpendPayoutCurveCard');
const { ToolsWorkerPhase: RealToolsWorkerPhase } =
    await import('~/app/(app)/prop-calculator/_components/useToolsWorker');

function requireInput(element: Element | null): HTMLInputElement {
    if (element === null) throw new Error('expected the input to exist');
    return element as HTMLInputElement;
}

function setInputValue(input: HTMLInputElement, value: string): void {
    Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
    )?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

function variantFor(): BankrollPlanVariantInputs {
    return {
        base: {
            fundedHorizonDays: 30,
            maxEvalDays: 30,
            riskPerTrade: 250,
            rrRatio: 2,
            seed: 7,
            tradesPerDay: 1,
            trials: 400,
            winrate: 0.42,
        },
        plan: {
            firmId: FirmId.TopStep,
            optIns: {
                takesFundedReset: false,
                takesOneTimeEarlyWithdrawal: false,
            },
            planSerial: serializePlanId({
                accountSize: 50_000,
                firm: FirmId.TopStep,
                variant: TopStepVariant.StandardStandard,
            }),
        },
        policy: {
            commissionPerRoundTrip: 0,
            fundedHorizonDays: 30,
            lifetimePayoutCapBasis:
                LifetimePayoutCapBasis.LiveTriggersNotChecked,
            lifetimePayoutCapOverride: null,
            payoutRequestOverride: 500,
            rebuyLagBasis: RebuyLagBasis.AssumedZero,
            rebuyLagDays: 0,
            retainedCushionRequest: 2000,
        },
    };
}

const CURVE_ROWS = [
    {
        budget: 5000,
        figures: {
            attempts: 30,
            expectedNet: 1200,
            expectedPayouts: 6150,
            expectedSpend: 4950,
            lossProbability: 0.31,
            lossProbabilityStandardError: 0.0046,
            netP10: -3000,
            netP90: 5200,
        },
        reason: null,
    },
    {
        budget: 10_000,
        figures: {
            attempts: 60,
            expectedNet: 2400,
            expectedPayouts: 12_300,
            expectedSpend: 9900,
            lossProbability: 0.2,
            lossProbabilityStandardError: null,
            netP10: -2500,
            netP90: 8800,
        },
        reason: null,
    },
    {
        budget: 50,
        figures: null,
        reason: EconomicsReason.InvalidInput,
    },
];

describe('SpendPayoutCurveCard (F-V14, PT-82 step 2)', () => {
    let root: Root;
    let container: HTMLElement;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        toolsWorkerBox.instances = [];
        variantBox.variant = variantFor();
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        vi.unstubAllGlobals();
    });

    function typeBudgets(text: string): void {
        act(() => {
            setInputValue(
                requireInput(
                    container.querySelector('#bankroll-curve-budgets'),
                ),
                text,
            );
        });
    }

    it('requests and shows nothing until budgets are typed', () => {
        act(() => {
            root.render(<SpendPayoutCurveCard />);
        });

        expect(
            requireInput(container.querySelector('#bankroll-curve-budgets'))
                .value,
        ).toBe('');
        expect(toolsWorkerBox.instances[0]?.runSpy).not.toHaveBeenCalled();
        expect(container.querySelector('table')).toBeNull();
    });

    it('requests a SpendPayoutCurve for the typed budgets on the shared variant', () => {
        act(() => {
            root.render(<SpendPayoutCurveCard />);
        });
        typeBudgets('5000, 10000, 20000');

        const runSpy = toolsWorkerBox.instances[0]?.runSpy;
        expect(runSpy).toHaveBeenCalledTimes(1);
        const [request] = runSpy?.mock.calls.at(-1) as [unknown];
        expect(request).toEqual({
            budgets: [5000, 10_000, 20_000],
            kind: ToolsRequestKind.SpendPayoutCurve,
            runId: 1,
            variant: variantFor(),
        });
    });

    it('does not request for a list that is not all positive amounts', () => {
        act(() => {
            root.render(<SpendPayoutCurveCard />);
        });
        typeBudgets('5000, abc');

        expect(toolsWorkerBox.instances[0]?.runSpy).not.toHaveBeenCalled();
    });

    it('refuses more than ten budgets with a message and sends nothing', () => {
        act(() => {
            root.render(<SpendPayoutCurveCard />);
        });
        typeBudgets('1,2,3,4,5,6,7,8,9,10,11');

        expect(toolsWorkerBox.instances[0]?.runSpy).not.toHaveBeenCalled();
        expect(container.textContent).toContain('Enter at most 10 budgets.');
    });

    it('draws the chart and a table with a row per budget, a reason for a budget it could not price', () => {
        act(() => {
            root.render(<SpendPayoutCurveCard />);
        });
        typeBudgets('5000, 10000, 50');
        act(() => {
            toolsWorkerBox.instances[0]?.setState({
                phase: RealToolsWorkerPhase.Succeeded,
                result: {
                    kind: ToolsResponseKind.SpendPayoutCurve,
                    rows: CURVE_ROWS,
                    runId: 1,
                },
            });
        });

        expect(
            container.querySelector(
                '.app-prop-calculator__bankroll-spend-payout-chart',
            ),
        ).not.toBeNull();
        expect(container.querySelectorAll('.recharts-line').length).toBe(3);
        const rows = [
            ...container.querySelectorAll(
                ':scope table[aria-label="Spend and payout per budget"] tbody tr',
            ),
        ];
        expect(rows).toHaveLength(3);
        const first = rows[0]?.textContent ?? '';
        expect(first).toContain('$5,000');
        expect(first).toContain('30');
        expect(first).toContain('$4,950');
        expect(first).toContain('$6,150');
        expect(first).toContain('$1,200');
        expect(first).toContain('-$3,000');
        expect(first).toContain('$5,200');
        expect(first).toContain('31.0% (SE 0.5%)');
        expect(rows[1]?.textContent).toContain('20.0%');
        expect(rows[1]?.textContent).not.toContain('SE');
        expect(rows[2]?.textContent).toContain('$50');
        expect(rows[2]?.textContent).toContain(
            'n/a: an input is missing, negative or out of range',
        );
    });

    it('shows the worker failure reason once budgets are typed', () => {
        act(() => {
            root.render(<SpendPayoutCurveCard />);
        });
        typeBudgets('5000');
        act(() => {
            toolsWorkerBox.instances[0]?.setState({
                phase: RealToolsWorkerPhase.Failed,
                reason: 'toolsWorker: no plan for the requested firm and serial',
            });
        });

        expect(container.querySelector('[role="alert"]')?.textContent).toBe(
            'toolsWorker: no plan for the requested firm and serial',
        );
    });

    it('drops the table when the budgets are cleared', () => {
        act(() => {
            root.render(<SpendPayoutCurveCard />);
        });
        typeBudgets('5000, 10000, 50');
        act(() => {
            toolsWorkerBox.instances[0]?.setState({
                phase: RealToolsWorkerPhase.Succeeded,
                result: {
                    kind: ToolsResponseKind.SpendPayoutCurve,
                    rows: CURVE_ROWS,
                    runId: 1,
                },
            });
        });
        expect(container.querySelector('table')).not.toBeNull();

        typeBudgets('');

        expect(container.querySelector('table')).toBeNull();
    });
});
