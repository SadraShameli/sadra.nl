import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PropCalculatorSubnav } from '~/app/(app)/prop-calculator/_components/PropCalculatorSubnav';
import {
    LINKED_TOOL_CATALOG,
    toolCatalogEntry,
    ToolId,
} from '~/app/(app)/prop-calculator/_components/toolCatalog';

import { basePath } from './toolPageFiles';

const navigation = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('next/navigation', () => ({
    usePathname: () => navigation.pathname,
}));

vi.mock('~/app/(app)/prop-calculator/_components/CalculatorProvider', () => ({
    useCalculatorInputs: () => ({
        debouncedQuery: 'firm=apex&lab=LAB&pf=PF',
    }),
}));

describe('PropCalculatorSubnav', () => {
    let container: HTMLDivElement;
    let root: Root;
    let slot: HTMLDivElement;

    function render(pathname: string) {
        navigation.pathname = pathname;
        act(() => {
            root.render(<PropCalculatorSubnav />);
        });
    }

    function links(): HTMLAnchorElement[] {
        return [...slot.querySelectorAll<HTMLAnchorElement>(':scope nav a')];
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        slot = document.createElement('div');
        slot.id = 'navbar-subnav-slot';
        document.body.append(slot);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        slot.remove();
        vi.unstubAllGlobals();
    });

    it('renders a nav labelled Prop calculator tools in the navbar slot', () => {
        render(LINKED_TOOL_CATALOG[0]?.route ?? '/');
        const navs = slot.querySelectorAll('nav');
        expect(navs).toHaveLength(1);
        expect(navs[0]?.getAttribute('aria-label')).toBe(
            'Prop calculator tools',
        );
        expect(
            links().map((link) => basePath(link.getAttribute('href') ?? '')),
        ).toEqual(LINKED_TOOL_CATALOG.map((entry) => entry.route));
    });

    it.each(
        LINKED_TOOL_CATALOG.map((entry): [string, string] => [
            entry.label,
            entry.route,
        ]),
    )('marks only %s as the current page on its own route', (_label, route) => {
        render(route);
        const current = links().filter(
            (link) => link.getAttribute('aria-current') === 'page',
        );
        expect(current).toHaveLength(1);
        expect(basePath(current[0]?.getAttribute('href') ?? '')).toBe(route);
        expect(
            links().filter(
                (link) => link.getAttribute('aria-current') !== null,
            ),
        ).toHaveLength(1);
    });

    it('gives the strategy lab link the lab state and the planner link the portfolio, and drops both elsewhere (PT-119)', () => {
        render(toolCatalogEntry(ToolId.Simulator).route);
        const hrefOf = (id: ToolId) =>
            links()
                .find(
                    (link) =>
                        basePath(link.getAttribute('href') ?? '') ===
                        toolCatalogEntry(id).route,
                )
                ?.getAttribute('href');
        expect(hrefOf(ToolId.StrategyLab)).toBe(
            `${toolCatalogEntry(ToolId.StrategyLab).route}?firm=apex&lab=LAB`,
        );
        expect(hrefOf(ToolId.Planner)).toBe(
            `${toolCatalogEntry(ToolId.Planner).route}?firm=apex&pf=PF`,
        );
        expect(hrefOf(ToolId.Analysis)).toBe(
            `${toolCatalogEntry(ToolId.Analysis).route}?firm=apex`,
        );
    });

    it('marks no link on a route outside the tools', () => {
        render('/prop-calculator');
        expect(
            links().filter(
                (link) => link.getAttribute('aria-current') !== null,
            ),
        ).toEqual([]);
    });
});
