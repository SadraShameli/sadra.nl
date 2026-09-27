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
});
