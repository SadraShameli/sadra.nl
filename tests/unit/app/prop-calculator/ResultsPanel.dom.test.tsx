import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import ResultsPanel from '~/app/(app)/prop-calculator/_components/ResultsPanel';
import { buildSimInputs } from '~/app/(app)/prop-calculator/_components/useCalculator';
import { formatCurrency } from '~/lib/format';
import {
    type SimInputs,
    type SimOutputs,
    simulate,
} from '~/lib/prop-calculator';

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
