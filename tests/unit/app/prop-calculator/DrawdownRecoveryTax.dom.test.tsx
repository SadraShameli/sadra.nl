import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import DrawdownDurationPanel from '~/app/(app)/prop-calculator/_components/DrawdownDurationPanel';
import { buildSimInputs } from '~/app/(app)/prop-calculator/_components/useCalculator';
import { simulate } from '~/lib/prop-calculator/simulator/engine';

describe('the recovery tax table', () => {
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
        vi.unstubAllGlobals();
    });

    it('states the gain needed to recover each drawdown once per row', () => {
        act(() => {
            root.render(
                <DrawdownDurationPanel
                    result={simulate(buildSimInputs(defaultCalculatorState()))}
                />,
            );
        });
        const firstRow = container.querySelector(
            ':scope .app-prop-calculator__recovery-tax-table tbody tr',
        );
        expect(firstRow?.textContent.match(/5\.3%/g)).toHaveLength(1);
    });

    it('writes a grade word under the gain each drawdown needs, in place of the old colours', () => {
        act(() => {
            root.render(
                <DrawdownDurationPanel
                    result={simulate(buildSimInputs(defaultCalculatorState()))}
                />,
            );
        });
        const gainCells = [
            ...container.querySelectorAll(
                ':scope .app-prop-calculator__recovery-tax-table tbody tr td',
            ),
        ];
        expect(
            gainCells.map((cell) =>
                [...(cell.querySelector('span')?.children ?? [])].map(
                    (line) => line.textContent,
                ),
            ),
        ).toStrictEqual([
            ['5.3% gain required', 'light'],
            ['11.1% gain required', 'light'],
            ['17.6% gain required', 'moderate'],
            ['25.0% gain required', 'heavy'],
            ['33.3% gain required', 'heavy'],
            ['49.3% gain required', 'heavy'],
        ]);
    });
});
