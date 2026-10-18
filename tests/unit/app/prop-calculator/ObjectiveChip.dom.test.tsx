import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ObjectiveSelect } from '~/app/(app)/prop-calculator/_components/ObjectiveChip';
import { SizingObjective } from '~/lib/prop-calculator/advisor';

import { objectiveSelect } from './objectiveSelect';

vi.mock(
    '~/app/(app)/prop-calculator/_components/CalculatorProvider',
    () => ({}),
);

describe('ObjectiveSelect on a narrow screen', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(
                <ObjectiveSelect
                    objective={SizingObjective.MonthlyNet}
                    onChange={vi.fn()}
                />,
            );
        });
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.unstubAllGlobals();
    });

    it('lets the trigger shrink inside its row, so a long objective truncates and the chevron stays inside the pill', () => {
        const trigger = objectiveSelect(container);
        const field = trigger.closest('[data-slot="field"]');
        expect(field?.classList.contains('max-w-full')).toBe(true);
        expect(field?.classList.contains('min-w-0')).toBe(true);
        expect(trigger.classList.contains('min-w-0')).toBe(true);
        expect(trigger.lastElementChild?.tagName.toLowerCase()).toBe('svg');
    });
});
