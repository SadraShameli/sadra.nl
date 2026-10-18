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
});
