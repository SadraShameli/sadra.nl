import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { HubToolCards } from '~/app/(app)/prop-calculator/_components/HubToolCards';
import { TOOL_CATALOG } from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { indexableRoutes } from '~/lib/site/routes';

import { basePath, hasToolPage, toolPageRoutes } from './toolPageFiles';

function byText(a: string, b: string): number {
    return a.localeCompare(b);
}

function hubHrefs(): string[] {
    const markup = renderToStaticMarkup(createElement(HubToolCards));
    return markup
        .matchAll(/href="([^"]*)"/g)
        .map(([, href = '']) => basePath(href))
        .toArray();
}

function toolRoutes(): ReadonlySet<string> {
    return new Set(TOOL_CATALOG.map((entry) => entry.route));
}

describe('tool availability (deploy safety)', () => {
    it('flags a catalog tool as having a page exactly when its page.tsx exists', () => {
        for (const entry of TOOL_CATALOG) {
            expect({ hasPage: entry.hasPage, id: entry.id }).toEqual({
                hasPage: hasToolPage(entry.route),
                id: entry.id,
            });
        }
    });

    it('gives every tool page on disk a catalog entry', () => {
        const catalogRoutes = toolRoutes();
        expect(
            toolPageRoutes().filter((route) => !catalogRoutes.has(route)),
        ).toEqual([]);
    });

    it('links the hub only to tool pages that exist, each once', () => {
        const hrefs = hubHrefs();
        expect(hrefs.filter((href) => !hasToolPage(href))).toEqual([]);
        expect(new Set(hrefs).size).toBe(hrefs.length);
        expect(hrefs.toSorted(byText)).toEqual(
            toolPageRoutes().toSorted(byText),
        );
    });

    it('lists exactly the linked tool pages in the sitemap', () => {
        const catalogRoutes = toolRoutes();
        const indexedTools = indexableRoutes.filter((route) =>
            catalogRoutes.has(route),
        );
        expect(indexedTools.toSorted(byText)).toEqual(
            TOOL_CATALOG.filter((entry) => entry.hasPage)
                .map((entry) => entry.route)
                .toSorted(byText),
        );
    });
});
