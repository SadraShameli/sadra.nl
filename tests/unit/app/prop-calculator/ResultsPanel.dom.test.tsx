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
import { formatCurrency } from '~/lib/format';
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
import { hasComputingIndicator } from './computingIndicator';
import { missingValueText } from './missingValue';
import {
    statStripCaption,
    statStripLabels,
    statStripValue,
} from './statStripValue';

const COLOUR_CODING_CLASS =
    /(?:text|bg|border)-(?:success|warning|destructive|danger)/;

vi.mock('~/components/ui/info-popover', () => ({
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

describe('ResultsPanel says a recompute is running in words, not by dimming the stale figures (wave 7 review)', () => {
    let container: HTMLDivElement;
    let root: Root;
    const result = simulate(calculatorInputs(1));

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

    function renderedPanel(isPending: boolean): Element | null {
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
        return container.querySelector(':scope .app-prop-calculator__results');
    }

    it.each([true, false])(
        'shows the Computing status and marks the panel busy only while pending (%s), never by opacity',
        (isPending) => {
            const panel = renderedPanel(isPending);
            expect(hasComputingIndicator(panel)).toBe(isPending);
            expect(panel?.getAttribute('aria-busy') === 'true').toBe(isPending);
            expect(panel?.className).not.toMatch(/\bopacity-/);
        },
    );
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
        const labels = statStripLabels(container);
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

    it('lists the attempt economics rows through DetailList, one label and value per row', () => {
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
        const list = container.querySelector(
            ':scope [data-testid="attempt-economics-card"] dl.app-detail-list',
        );
        if (list === null) throw new Error('attempt economics list missing');
        const labels = [...list.querySelectorAll('dt')].map(
            (term) => term.textContent,
        );
        expect(labels[0]).toBe('Attempt price');
        expect(labels).toContain('Per-attempt pass');
        expect(list.querySelectorAll('dd')).toHaveLength(labels.length);
    });

    it('shows a missing value, not n/a text, for funded value to attempt cost when the attempt costs nothing', () => {
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
        expect(card.textContent).toContain(missingValueText());
        expect(card.textContent).not.toContain('n/a');
    });

    it('shows a negative EV per attempt in the default ink with its minus sign, never a loss colour', () => {
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
        const value = statStripValue(container, 'EV per attempt');
        expect(value?.className).toContain('text-ink');
        expect(value?.className).not.toMatch(COLOUR_CODING_CLASS);
        expect(value?.textContent.startsWith('-$')).toBe(true);
    });

    it('shows a positive EV per attempt in the same default ink as a negative one', () => {
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
        const value = statStripValue(container, 'EV per attempt');
        expect(value?.className).toContain('text-ink');
        expect(value?.className).not.toMatch(COLOUR_CODING_CLASS);
    });

    it('says in words whether each pinned delta is better or worse, in the default ink', () => {
        const result = simulate(calculatorInputs(1));
        const pinned: SimOutputs = {
            ...result,
            evalPassProbability: result.evalPassProbability - 0.1,
            expectedTotalCost: result.expectedTotalCost - 100,
        };
        act(() => {
            root.render(
                <ResultsPanel
                    fundedHorizonDays={60}
                    isPending={false}
                    onPin={vi.fn()}
                    onUnpin={vi.fn()}
                    pinned={pinned}
                    plan={calculatorInputs(1).plan}
                    result={result}
                />,
            );
        });
        const evalPassCaption = statStripCaption(container, 'Eval pass');
        const costCaption = statStripCaption(container, 'Total cost (avg)');
        expect(evalPassCaption?.textContent).toContain(
            '+10.0pp vs pinned, better',
        );
        expect(costCaption?.textContent).toContain('+$100 vs pinned, worse');
        for (const caption of [evalPassCaption, costCaption]) {
            expect(caption?.outerHTML).not.toMatch(COLOUR_CODING_CLASS);
        }
    });

    it('draws every KPI value in the default ink, whatever its sign or size', () => {
        const result: SimOutputs = {
            ...simulate(calculatorInputs(1)),
            bustProbability: 0.9,
            evalPassProbability: 0.05,
            expectedMonthlyNet: -400,
            fundedSurvivalProbability: 0.95,
            risk5LossesPercent: 0.9,
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
        for (const label of [
            'Eval pass',
            'Funded survive',
            'Monthly net (est)',
            'Bust before passing',
            'Risk of 5+ losses',
            'ROI on cost',
        ]) {
            expect(statStripValue(container, label)?.className).toContain(
                'text-ink',
            );
            expect(statStripValue(container, label)?.className).not.toContain(
                'text-ink-muted',
            );
        }
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
        expect(result.fundedPayoutCountDistribution.length).toBeGreaterThan(0);
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
