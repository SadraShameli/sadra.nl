import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SectionPageTabs } from '~/app/(app)/_components/SectionPageTabs';
import {
    toolCatalogEntry,
    ToolId,
} from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { useToolNavItems } from '~/app/(app)/prop-calculator/_components/useToolNavItems';

const harness = vi.hoisted(() => ({
    debouncedQuery: 'firm=apex&lab=LAB&pf=PF',
    pathname: '/',
}));

vi.mock('next/navigation', () => ({
    usePathname: () => harness.pathname,
}));

vi.mock('~/app/(app)/prop-calculator/_components/CalculatorProvider', () => ({
    useCalculatorInputs: () => ({ debouncedQuery: harness.debouncedQuery }),
}));

const TABS_LABEL = 'Calculator tabs under test';

function CalculatorTabs() {
    return <SectionPageTabs items={useToolNavItems()} label={TABS_LABEL} />;
}

describe('the calculator page tabs built from useToolNavItems', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(id: ToolId) {
        harness.pathname = toolCatalogEntry(id).route;
        act(() => {
            root.render(<CalculatorTabs />);
        });
    }

    function hrefOf(id: ToolId): null | string | undefined {
        return [
            ...container.querySelectorAll<HTMLAnchorElement>(':scope nav a'),
        ]
            .find((tab) => tab.textContent === toolCatalogEntry(id).label)
            ?.getAttribute('href');
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.debouncedQuery = 'firm=apex&lab=LAB&pf=PF';
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

    it('links the strategy lab tab with the lab state and the ladder lab tab without it (PT-119)', () => {
        render(ToolId.StrategyLab);
        expect(hrefOf(ToolId.StrategyLab)).toBe(
            `${toolCatalogEntry(ToolId.StrategyLab).route}?firm=apex&lab=LAB`,
        );
        expect(hrefOf(ToolId.LadderLab)).toBe(
            `${toolCatalogEntry(ToolId.LadderLab).route}?firm=apex`,
        );
    });

    it('links the planner tab with the portfolio and keeps the calculator query off the payout planner (PT-119)', () => {
        render(ToolId.Planner);
        expect(hrefOf(ToolId.Planner)).toBe(
            `${toolCatalogEntry(ToolId.Planner).route}?firm=apex&pf=PF`,
        );
        expect(hrefOf(ToolId.CashFlow)).toBe(
            `${toolCatalogEntry(ToolId.CashFlow).route}?firm=apex`,
        );
        expect(hrefOf(ToolId.PayoutPlanner)).toBe(
            toolCatalogEntry(ToolId.PayoutPlanner).route,
        );
    });

    it('follows the debounced calculator query as it changes', () => {
        render(ToolId.Simulator);
        expect(hrefOf(ToolId.Live)).toBe(
            `${toolCatalogEntry(ToolId.Live).route}?firm=apex`,
        );
        harness.debouncedQuery = 'firm=topstep';
        render(ToolId.Simulator);
        expect(hrefOf(ToolId.Live)).toBe(
            `${toolCatalogEntry(ToolId.Live).route}?firm=topstep`,
        );
    });

    it('renders no tabs on a tool that is alone in its group', () => {
        render(ToolId.Analysis);
        expect(container.querySelector('nav')).toBeNull();
    });
});
