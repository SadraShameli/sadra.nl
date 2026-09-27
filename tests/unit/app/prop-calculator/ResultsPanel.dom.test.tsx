import type * as Recharts from 'recharts';

import { act, cloneElement, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('recharts', async (importOriginal) => {
    const actual = await importOriginal<typeof Recharts>();
    return {
        ...actual,
        ResponsiveContainer: ({ children }: { children: ReactElement }) =>
            cloneElement(children, { height: 200, width: 400 } as never),
    };
});

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import ResultsPanel from '~/app/(app)/prop-calculator/_components/ResultsPanel';
import { buildSimInputs } from '~/app/(app)/prop-calculator/_components/useCalculator';
import { formatCurrency, NOT_APPLICABLE } from '~/lib/format';
import {
    LifetimeCapScope,
    type Plan,
    type SimInputs,
    type SimOutputs,
    simulate,
} from '~/lib/prop-calculator';

import {
    mffProLifetimeCapFixture,
    WINNING_TRADER,
} from '../../lib/prop-calculator/fixtures/mffProLifetimeCapFixture';

vi.mock('~/components/ui/InfoPopover', () => ({
    default: ({ children, title }: { children: ReactNode; title: string }) => (
        <div data-info-title={title}>{children}</div>
    ),
}));

function calculatorInputs(copyAccounts: number): SimInputs {
    return buildSimInputs({
        ...defaultCalculatorState(),
        copyAccounts,
        trials: 200,
    });
}

function copyTotalLine(result: SimOutputs, copyAccounts: number): string {
    return `Total over ${copyAccounts} copy-traded accounts: gross ${formatCurrency(result.expectedGrossPayout)} − cost ${formatCurrency(result.expectedTotalCost)} = net ${formatCurrency(result.expectedNet)}`;
}

function plainLine(result: SimOutputs): string {
    return `Gross ${formatCurrency(result.expectedGrossPayout)} − cost ${formatCurrency(result.expectedTotalCost)} = net ${formatCurrency(result.expectedNet)}`;
}

describe('ResultsPanel monthly net breakdown line reads the copy-account count from the run it describes (N-71, N-72, WP43g, WP43h)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function breakdownLine(result: SimOutputs, isPending = false): string {
        act(() => {
            root.render(
                <ResultsPanel
                    isPending={isPending}
                    onPin={vi.fn()}
                    onUnpin={vi.fn()}
                    pinned={null}
                    plan={calculatorInputs(1).plan}
                    result={result}
                />,
            );
        });
        const info = container.querySelector(
            '[data-info-title="Monthly net (est)"]',
        );
        if (!info) throw new Error('monthly net info body missing');
        const line = info.querySelector(':scope p.font-mono');
        if (!line) throw new Error('monthly net breakdown line missing');
        return line.textContent;
    }

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
    });

    it('prints the plain gross, cost and net line for a one-account run', () => {
        const result = simulate(calculatorInputs(1));
        expect(result.copyAccounts).toBe(1);
        expect(breakdownLine(result)).toBe(plainLine(result));
    });

    it('labels the line as the total over the copy-traded accounts of a three-account run, whose figures the engine sums over them', () => {
        const single = simulate(calculatorInputs(1));
        const result = simulate(calculatorInputs(3));
        expect(result.copyAccounts).toBe(3);
        expect(result.expectedGrossPayout).toBeCloseTo(
            single.expectedGrossPayout * 3,
            6,
        );
        expect(result.expectedTotalCost).toBeCloseTo(
            single.expectedTotalCost * 3,
            6,
        );
        expect(result.expectedNet).toBeCloseTo(single.expectedNet * 3, 6);
        expect(breakdownLine(result)).toBe(copyTotalLine(result, 3));
    });

    it('takes the count from the result alone, so a run of four copy accounts is labelled four', () => {
        const result: SimOutputs = {
            ...simulate(calculatorInputs(1)),
            copyAccounts: 4,
        };
        expect(breakdownLine(result)).toBe(copyTotalLine(result, 4));
    });

    it('keeps the line while a recompute is pending, labelled with the count of the run whose figures it shows', () => {
        const triple = simulate(calculatorInputs(3));
        expect(breakdownLine(triple, true)).toBe(copyTotalLine(triple, 3));
        const single = simulate(calculatorInputs(1));
        expect(breakdownLine(single, true)).toBe(plainLine(single));
    });
});

describe('ResultsPanel shows EV per attempt beside monthly net when a funded horizon is given (F-V9, PT-61)', () => {
    let container: HTMLDivElement;
    let root: Root;

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
    });

    it('keeps monthly net first and shows EV per attempt right after it', () => {
        const result = simulate(calculatorInputs(1));
        act(() => {
            root.render(
                <ResultsPanel
                    fundedHorizonDays={60}
                    isPending={false}
                    onPin={vi.fn()}
                    onUnpin={vi.fn()}
                    pinned={null}
                    plan={calculatorInputs(1).plan}
                    result={result}
                />,
            );
        });
        const labels = [...container.querySelectorAll('.uppercase')].map(
            (node) => node.textContent,
        );
        const netIndex = labels.indexOf('Monthly net (est)');
        const evIndex = labels.indexOf('EV per attempt');
        expect(netIndex).toBeGreaterThanOrEqual(0);
        expect(evIndex).toBe(netIndex + 1);
    });

    it('omits EV per attempt when no funded horizon is given, unchanged from before', () => {
        const result = simulate(calculatorInputs(1));
        act(() => {
            root.render(
                <ResultsPanel
                    isPending={false}
                    onPin={vi.fn()}
                    onUnpin={vi.fn()}
                    pinned={null}
                    plan={calculatorInputs(1).plan}
                    result={result}
                />,
            );
        });
        expect(container.textContent).not.toContain('EV per attempt');
    });

    it('shows the funded value to attempt cost ratio in the attempt economics card', () => {
        const result = simulate(calculatorInputs(1));
        act(() => {
            root.render(
                <ResultsPanel
                    fundedHorizonDays={60}
                    isPending={false}
                    onPin={vi.fn()}
                    onUnpin={vi.fn()}
                    pinned={null}
                    plan={calculatorInputs(1).plan}
                    result={result}
                />,
            );
        });
        const card = container.querySelector(
            '[data-testid="attempt-economics-card"]',
        );
        if (!card) throw new Error('attempt economics card missing');
        expect(card.textContent).toContain('funded value / attempt cost');
    });

    it('shows n/a for funded value to attempt cost when the attempt costs nothing', () => {
        const result: SimOutputs = {
            ...simulate(calculatorInputs(1)),
            costPerAttempt: 0,
        };
        act(() => {
            root.render(
                <ResultsPanel
                    fundedHorizonDays={60}
                    isPending={false}
                    onPin={vi.fn()}
                    onUnpin={vi.fn()}
                    pinned={null}
                    plan={calculatorInputs(1).plan}
                    result={result}
                />,
            );
        });
        const card = container.querySelector(
            '[data-testid="attempt-economics-card"]',
        );
        if (!card) throw new Error('attempt economics card missing');
        expect(card.textContent).toContain(NOT_APPLICABLE);
    });

    it('colors EV per attempt negative when the value is negative, like other signed KPIs', () => {
        const result: SimOutputs = {
            ...simulate(calculatorInputs(1)),
            expectedNetPerAttempt: -50,
        };
        act(() => {
            root.render(
                <ResultsPanel
                    fundedHorizonDays={60}
                    isPending={false}
                    onPin={vi.fn()}
                    onUnpin={vi.fn()}
                    pinned={null}
                    plan={calculatorInputs(1).plan}
                    result={result}
                />,
            );
        });
        const evLabel = [...container.querySelectorAll('.uppercase')].find(
            (node) => node.textContent === 'EV per attempt',
        );
        const card = evLabel?.closest('[data-slot="card"]');
        const valueSpan = card?.querySelector('.font-mono.text-2xl');
        expect(valueSpan?.className).toContain('text-rose-400');
    });

    it('colors EV per attempt positive when the value is positive, like other signed KPIs', () => {
        const result: SimOutputs = {
            ...simulate(calculatorInputs(1)),
            expectedNetPerAttempt: 50,
        };
        act(() => {
            root.render(
                <ResultsPanel
                    fundedHorizonDays={60}
                    isPending={false}
                    onPin={vi.fn()}
                    onUnpin={vi.fn()}
                    pinned={null}
                    plan={calculatorInputs(1).plan}
                    result={result}
                />,
            );
        });
        const evLabel = [...container.querySelectorAll('.uppercase')].find(
            (node) => node.textContent === 'EV per attempt',
        );
        const card = evLabel?.closest('[data-slot="card"]');
        const valueSpan = card?.querySelector('.font-mono.text-2xl');
        expect(valueSpan?.className).toContain('text-emerald-400');
    });
});

describe('ResultsPanel places the payouts-per-funded-account distribution (F-V8, PT-61b)', () => {
    let container: HTMLDivElement;
    let root: Root;

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
    });

    it('shows the distribution chart when the run has funded trials', () => {
        const result = simulate(calculatorInputs(1));
        expect(result.fundedPayoutCountDistribution.length).toBeGreaterThan(
            0,
        );
        act(() => {
            root.render(
                <ResultsPanel
                    isPending={false}
                    onPin={vi.fn()}
                    onUnpin={vi.fn()}
                    pinned={null}
                    plan={calculatorInputs(1).plan}
                    result={result}
                />,
            );
        });
        const chart = container.querySelector(
            '.app-prop-calculator__accounts-passed-chart',
        );
        expect(chart).not.toBeNull();
        expect(container.textContent).toContain('payouts per funded account');
    });

    it('omits the chart when no trial ever reached funded', () => {
        const result: SimOutputs = {
            ...simulate(calculatorInputs(1)),
            fundedPayoutCountDistribution: [],
        };
        act(() => {
            root.render(
                <ResultsPanel
                    isPending={false}
                    onPin={vi.fn()}
                    onUnpin={vi.fn()}
                    pinned={null}
                    plan={calculatorInputs(1).plan}
                    result={result}
                />,
            );
        });
        const chart = container.querySelector(
            '.app-prop-calculator__accounts-passed-chart',
        );
        expect(chart).toBeNull();
    });
});

describe('ResultsPanel never shows a combined gross payout above the pooled per-user cap on 3 copied MFF Pro accounts (F-110, PT-12m)', () => {
    const { cap: CAP, plan: mffPro } = mffProLifetimeCapFixture();

    let container: HTMLDivElement;
    let root: Root;

    function renderedGrossPayoutLine(result: SimOutputs, plan: Plan): string {
        act(() => {
            root.render(
                <ResultsPanel
                    isPending={false}
                    onPin={vi.fn()}
                    onUnpin={vi.fn()}
                    pinned={null}
                    plan={plan}
                    result={result}
                />,
            );
        });
        const info = container.querySelector(
            '[data-info-title="Monthly net (est)"]',
        );
        if (!info) throw new Error('monthly net info body missing');
        const line = info.querySelector(':scope p.font-mono');
        if (!line) throw new Error('monthly net breakdown line missing');
        return line.textContent;
    }

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
    });

    it('renders a gross payout at or below the $100,000 pooled cap for a winning trader on 3 copies', () => {
        const result = simulate({ ...WINNING_TRADER, plan: mffPro });
        expect(result.expectedGrossPayout).toBeLessThanOrEqual(CAP);
        const line = renderedGrossPayoutLine(result, mffPro);
        expect(line).toContain(formatCurrency(result.expectedGrossPayout));
        expect(line).not.toContain(formatCurrency(CAP + 1));
    });

    it('leaves a per-account-scope plan unaffected: it is not silently capped by the reader too', () => {
        const perAccountPlan = mffPro.withOverrides({
            lifetimeDollarCapScope: LifetimeCapScope.PerAccount,
        });
        const result = simulate({ ...WINNING_TRADER, plan: perAccountPlan });
        expect(result.expectedGrossPayout).toBeGreaterThan(CAP);
        const line = renderedGrossPayoutLine(result, perAccountPlan);
        expect(line).toContain(formatCurrency(result.expectedGrossPayout));
    });
});
