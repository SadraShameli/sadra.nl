import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    TOOL_CATALOG,
    ToolId,
} from '~/app/(app)/prop-calculator/_components/toolCatalog';

import { propCalculatorAppDir } from './appPageFiles';
import { sourceText, toolPageRoutes } from './toolPageFiles';

const METADATA_EXPORT =
    /export const metadata: Metadata = buildToolMetadata\(\s*ToolId\.(\w+),?\s*\);/g;

function metadataToolIds(route: string): ToolId[] {
    const folder = route.slice(route.lastIndexOf('/') + 1);
    const source = sourceText(
        path.join(propCalculatorAppDir('(tools)', folder), 'page.tsx'),
    );
    return source
        .matchAll(METADATA_EXPORT)
        .map((match) => ToolId[match[1] as keyof typeof ToolId])
        .toArray();
}

describe('every tool page exports the metadata of its own catalog tool', () => {
    const routes = toolPageRoutes();

    it('finds the tool pages on disk', () => {
        expect(routes.length).toBeGreaterThan(0);
        expect(routes.length).toBe(
            TOOL_CATALOG.filter((entry) => entry.hasPage).length,
        );
    });

    it.each(routes)(
        '%s exports buildToolMetadata for its own ToolId',
        (route) => {
            const owner = TOOL_CATALOG.find((entry) => entry.route === route);
            expect(owner).toBeDefined();
            expect(metadataToolIds(route)).toEqual([owner?.id]);
        },
    );

    it('covers the bankroll, live, rules and payout planner pages', () => {
        for (const id of [
            ToolId.Bankroll,
            ToolId.Live,
            ToolId.PayoutPlanner,
            ToolId.Rules,
        ]) {
            const entry = TOOL_CATALOG.find((candidate) => candidate.id === id);
            expect(routes).toContain(entry?.route);
        }
    });
});
