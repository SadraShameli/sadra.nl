import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    OptimumFigureKind,
    OptimumRowStatus,
    type OptimumRowView,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/adviceViewModel';
import { OptimaTable } from '~/app/(app)/prop-calculator/accounts/_components/advice/OptimaTable';
import { AdviceSource } from '~/lib/prop-calculator/advisor';

const LADDER_ROW: OptimumRowView = {
    figures: [
        {
            kind: OptimumFigureKind.PassRate,
            label: 'Pass rate',
            standardError: 0.011,
            standardErrorText: '1.1%',
            value: 0.428,
            valueText: '42.8%',
        },
        {
            kind: OptimumFigureKind.DaysToFunded,
            label: 'Days to funded',
            standardError: 0.3,
            standardErrorText: '0.3',
            value: 5.5,
            valueText: '5.5',
        },
        {
            kind: OptimumFigureKind.CostPerFunded,
            label: 'Cost per funded',
            standardError: null,
            standardErrorText: null,
            value: 264,
            valueText: '$264.00',
        },
    ],
    label: 'Ladder search (fresh start)',
    ladder: [400, 600],
    source: AdviceSource.LadderSearchFresh,
    standardError: 0.3,
    status: OptimumRowStatus.Ready,
    text: 'Fastest-to-funded ladder $400, $600: pass rate 42.8%.',
    value: 5.5,
};

describe('the optima table prints every figure with its standard error (PT-108 step 1, F-119)', () => {
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
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    function render(rows: readonly OptimumRowView[]) {
        act(() => {
            root.render(<OptimaTable rows={rows} />);
        });
    }

    it('prints "(SE ...)" after each figure that has one', () => {
        render([LADDER_ROW]);

        const text = container.textContent;
        expect(text).toContain('Pass rate 42.8% (SE 1.1%)');
        expect(text).toContain('Days to funded 5.5 (SE 0.3)');
    });

    it('prints a figure without a standard error with no "(SE" after it', () => {
        render([LADDER_ROW]);

        const items = [...container.querySelectorAll('li')].map(
            (item) => item.textContent,
        );
        expect(items).toContain('Cost per funded $264.00');
    });

    it('prints the row sentence beside its figures', () => {
        render([LADDER_ROW]);

        expect(container.textContent).toContain(
            'Fastest-to-funded ladder $400, $600',
        );
    });

    it('renders a left-out row with no figure list', () => {
        render([
            {
                figures: [],
                label: 'Ladder search (fresh start)',
                ladder: null,
                source: AdviceSource.LadderSearchFresh,
                standardError: null,
                status: OptimumRowStatus.LeftOut,
                text: 'Left out: the grid is too large.',
                value: null,
            },
        ]);

        expect(container.querySelectorAll('li')).toHaveLength(0);
        expect(container.textContent).toContain('Left out: the grid');
    });
});
