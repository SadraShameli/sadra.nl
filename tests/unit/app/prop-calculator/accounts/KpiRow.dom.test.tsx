import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KpiRow } from '~/app/(app)/prop-calculator/accounts/_components/overview/KpiRow';
import {
    KpiState,
    type OverviewKpi,
    OverviewKpiKind,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { NOT_APPLICABLE } from '~/lib/format';

import { infoText } from '../infoPopover';

const ENGINE_FAILURE =
    'The engine cards could not be computed: Web workers are not available in this browser.';

function kpi(overrides: Partial<OverviewKpi>): OverviewKpi {
    return {
        detail: null,
        kind: OverviewKpiKind.Net,
        label: 'Net',
        note: null,
        state: KpiState.Ready,
        value: '$100',
        ...overrides,
    };
}

describe('KpiRow', () => {
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

    function render(kpis: readonly OverviewKpi[]) {
        act(() => {
            root.render(<KpiRow kpis={kpis} />);
        });
    }

    function labels(): readonly string[] {
        return [...container.querySelectorAll('dt')].map(
            (term) => term.textContent,
        );
    }

    it('keeps a KPI that could not be computed, as a missing value that gives the failure as its reason', () => {
        render([
            kpi({}),
            kpi({
                detail: ENGINE_FAILURE,
                kind: OverviewKpiKind.ExpectedNet,
                label: 'Expected net per slot per month',
                state: KpiState.Failed,
                value: NOT_APPLICABLE,
            }),
        ]);
        expect(labels()).toEqual(['Net', 'Expected net per slot per month']);
        expect(container.textContent).toContain('Not available');
        expect(container.textContent).not.toContain(NOT_APPLICABLE);
        expect(infoText(container, 'Not available')).toContain(ENGINE_FAILURE);
    });

    it('hides a KPI that has no figure for an ordinary reason', () => {
        render([
            kpi({}),
            kpi({
                detail: 'No sizing decision recorded yet',
                kind: OverviewKpiKind.FollowedRecommendations,
                label: 'Followed recommendations',
                value: NOT_APPLICABLE,
            }),
        ]);
        expect(labels()).toEqual(['Net']);
    });
});
