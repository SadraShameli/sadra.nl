import type * as Recharts from 'recharts';

import { act, cloneElement, type ReactElement } from 'react';
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

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import SensitivityHeatmap from '~/app/(app)/prop-calculator/_components/SensitivityHeatmap';
import { buildSimInputs } from '~/app/(app)/prop-calculator/_components/useCalculator';

describe('SensitivityHeatmap shows an EV-per-attempt metric (F-V9, PT-61b)', () => {
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

    it('renders a fourth card titled with EV per attempt, labelled per attempt', () => {
        const baseInputs = buildSimInputs(defaultCalculatorState());
        act(() => {
            root.render(
                <SensitivityHeatmap
                    baseInputs={baseInputs}
                    currentRR={baseInputs.rrRatio}
                    currentWinrate={baseInputs.winrate}
                />,
            );
        });
        expect(container.textContent).toContain('EV per attempt sensitivity');
        expect(container.textContent).toContain('per attempt');
    });

    it('describes the cells in the camel and ink they are drawn in, never red or green', () => {
        const baseInputs = buildSimInputs(defaultCalculatorState());
        act(() => {
            root.render(
                <SensitivityHeatmap
                    baseInputs={baseInputs}
                    currentRR={baseInputs.rrRatio}
                    currentWinrate={baseInputs.winrate}
                />,
            );
        });
        expect(container.textContent).not.toMatch(/\b(red|green)\b/i);
        expect(container.textContent).toContain('camel = robust');
        expect(container.textContent).toContain('camel = profit');
    });

    it('keeps each heatmap a scrolling winrate by RR grid on phone, never stacked cards', () => {
        const baseInputs = buildSimInputs(defaultCalculatorState());
        act(() => {
            root.render(
                <SensitivityHeatmap
                    baseInputs={baseInputs}
                    currentRR={baseInputs.rrRatio}
                    currentWinrate={baseInputs.winrate}
                />,
            );
        });
        expect(container.querySelector('[data-label]')).toBeNull();
        const firstTable = container.querySelector(':scope table');
        expect(
            [...(firstTable?.querySelectorAll(':scope thead th') ?? [])].map(
                (header) => header.textContent,
            ),
        ).toEqual([
            'WR ↓ RR →',
            '1:1',
            '1.5:1',
            '2:1',
            '2.5:1',
            '3:1',
            '3.5:1',
            '4:1',
        ]);
        expect(
            firstTable?.querySelectorAll(':scope tbody th[scope="row"]'),
        ).toHaveLength(7);
    });

    it('pins a narrow winrate column on phone so the RR columns scroll beside it', () => {
        const baseInputs = buildSimInputs(defaultCalculatorState());
        act(() => {
            root.render(
                <SensitivityHeatmap
                    baseInputs={baseInputs}
                    currentRR={baseInputs.rrRatio}
                    currentWinrate={baseInputs.winrate}
                />,
            );
        });
        const tables = [...container.querySelectorAll('table')];
        expect(tables).toHaveLength(4);
        for (const table of tables) {
            for (const token of [
                'max-md:[&_tr>*:first-child]:sticky',
                'max-md:[&_tr>*:first-child]:left-0',
                'max-md:[&_tr>*:first-child]:bg-background',
                'max-md:[&_td]:px-1',
            ]) {
                expect(table.classList.contains(token)).toBe(true);
            }
        }
    });
});
