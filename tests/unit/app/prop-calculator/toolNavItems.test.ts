import { describe, expect, it } from 'vitest';

import { type RouteSubnavItem } from '~/app/(app)/_components/RouteSubnav';
import {
    activeSubnavGroup,
    activeSubnavHref,
    subnavHref,
} from '~/app/(app)/_components/routeSubnavLinks';
import {
    LINKED_TOOL_CATALOG,
    pageStateBlobsOf,
    toolCatalogEntry,
    ToolId,
    toolsByGroup,
} from '~/app/(app)/prop-calculator/_components/toolCatalog';
import {
    toolNavItems,
    toolNavPage,
} from '~/app/(app)/prop-calculator/_components/toolNavItems';
import { withPageStateBlobsOnly } from '~/app/(app)/prop-calculator/_components/urlState';

import { hasToolPage } from './toolPageFiles';

const QUERY = 'firm=apex&lab=LAB&pf=PF';

function byText(a: string, b: string): number {
    return a.localeCompare(b);
}

function itemLabelled(label: string): RouteSubnavItem {
    const item = toolNavItems(QUERY).find((entry) => entry.label === label);
    if (item === undefined) throw new Error(`no nav item ${label}`);
    return item;
}

function tabHrefOf(id: ToolId): string {
    const entry = toolCatalogEntry(id);
    const page = activeSubnavGroup(
        entry.route,
        toolNavItems(QUERY),
    )?.pages?.find((candidate) => candidate.href === entry.route);
    if (page === undefined) throw new Error(`no tab for ${id}`);
    return subnavHref(page, '');
}

describe('toolNavItems', () => {
    it('has one item per tool group, in the hub order, labelled by the group or by its only tool', () => {
        expect(toolNavItems(QUERY).map((item) => item.label)).toEqual(
            toolsByGroup(LINKED_TOOL_CATALOG).map((group) =>
                group.tools.length === 1 ? group.tools[0].label : group.label,
            ),
        );
        expect(toolNavItems(QUERY).map((item) => item.label)).toEqual([
            'Simulate',
            'Analysis',
            'Size',
            'Compare',
            'Plan',
            'Labs',
        ]);
    });

    it('makes a group with one tool a plain item with no pages', () => {
        const analysis = itemLabelled('Analysis');
        expect(analysis.pages).toBeUndefined();
        expect(analysis).toEqual(
            toolNavPage(toolCatalogEntry(ToolId.Analysis), QUERY),
        );
    });

    it('lists each group tools as its pages, in catalog order, and opens the group on its first page', () => {
        for (const group of toolsByGroup(LINKED_TOOL_CATALOG)) {
            if (group.tools.length === 1) continue;
            const item = itemLabelled(group.label);
            expect(item.pages?.map((page) => page.href)).toEqual(
                group.tools.map((tool) => tool.route),
            );
            expect(item.pages?.map((page) => page.label)).toEqual(
                group.tools.map((tool) => tool.label),
            );
            expect(item.href).toBe(group.tools[0].route);
            expect(item.query).toBe(item.pages?.[0].query);
            expect(item.carriesQuery).toBe(item.pages?.[0].carriesQuery);
            expect(item.prefetch).toBe(false);
        }
    });

    it('reaches every linked tool exactly once', () => {
        const routes = toolNavItems(QUERY).flatMap(
            (item) => item.pages?.map((page) => page.href) ?? [item.href],
        );
        expect(routes.toSorted(byText)).toEqual(
            LINKED_TOOL_CATALOG.map((entry) => entry.route).toSorted(byText),
        );
    });

    it('links every item and every page only to a tool page that exists', () => {
        const hrefs = toolNavItems(QUERY).flatMap((item) => [
            item.href,
            ...(item.pages?.map((page) => page.href) ?? []),
        ]);
        expect(hrefs.filter((href) => !hasToolPage(href))).toEqual([]);
    });

    it('marks the group of each tool route as the active section', () => {
        const items = toolNavItems(QUERY);
        for (const group of toolsByGroup(LINKED_TOOL_CATALOG)) {
            for (const tool of group.tools) {
                expect(activeSubnavHref(tool.route, items)).toBe(
                    group.tools[0].route,
                );
            }
        }
    });

    it('carries the calculator query to every tool page exactly as the flat nav did, without prefetch', () => {
        for (const entry of LINKED_TOOL_CATALOG) {
            expect(toolNavPage(entry, QUERY)).toEqual({
                carriesQuery: entry.usesCalculatorInputs,
                href: entry.route,
                label: entry.label,
                prefetch: false,
                query: withPageStateBlobsOnly(
                    QUERY,
                    pageStateBlobsOf(entry.id),
                ),
            });
        }
    });

    it('gives the strategy lab tab the lab state and the planner tab the portfolio, and drops both elsewhere (PT-119)', () => {
        expect(tabHrefOf(ToolId.StrategyLab)).toBe(
            `${toolCatalogEntry(ToolId.StrategyLab).route}?firm=apex&lab=LAB`,
        );
        expect(tabHrefOf(ToolId.LadderLab)).toBe(
            `${toolCatalogEntry(ToolId.LadderLab).route}?firm=apex`,
        );
        expect(tabHrefOf(ToolId.Planner)).toBe(
            `${toolCatalogEntry(ToolId.Planner).route}?firm=apex&pf=PF`,
        );
        expect(tabHrefOf(ToolId.CashFlow)).toBe(
            `${toolCatalogEntry(ToolId.CashFlow).route}?firm=apex`,
        );
    });

    it('never gives the calculator query to a tool with its own inputs', () => {
        expect(tabHrefOf(ToolId.PositionSize)).toBe(
            toolCatalogEntry(ToolId.PositionSize).route,
        );
        expect(tabHrefOf(ToolId.PayoutPlanner)).toBe(
            toolCatalogEntry(ToolId.PayoutPlanner).route,
        );
        expect(tabHrefOf(ToolId.Rules)).toBe(
            toolCatalogEntry(ToolId.Rules).route,
        );
    });
});
