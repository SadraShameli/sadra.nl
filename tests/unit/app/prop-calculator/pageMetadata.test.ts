import { describe, expect, it } from 'vitest';

import {
    buildHubMetadata,
    buildToolMetadata,
} from '~/app/(app)/prop-calculator/_components/pageMetadata';
import {
    TOOL_CATALOG,
    toolCatalogEntry,
    ToolId,
} from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { ALL_FIRMS } from '~/lib/prop-calculator';
import { routes } from '~/lib/site/routes';

describe('buildToolMetadata', () => {
    it('gives the simulator a title, a description and a query-free canonical', () => {
        const metadata = buildToolMetadata(ToolId.Simulator);
        expect(metadata.title).toEqual(expect.stringContaining('Simulator'));
        expect(typeof metadata.description).toBe('string');
        expect(metadata.alternates?.canonical).toBe(
            '/prop-calculator/simulator',
        );
    });

    it('covers every tool with its own canonical route and a description naming the firm count', () => {
        for (const entry of TOOL_CATALOG) {
            const metadata = buildToolMetadata(entry.id);
            expect(metadata.title).toEqual(
                expect.stringContaining(entry.label),
            );
            expect(metadata.alternates?.canonical).toBe(entry.route);
            expect(metadata.description).toEqual(
                expect.stringContaining(String(ALL_FIRMS.length)),
            );
        }
    });

    it('keeps descriptions short enough for a search snippet', () => {
        for (const entry of TOOL_CATALOG) {
            const { description } = buildToolMetadata(entry.id);
            expect((description ?? '').length).toBeLessThanOrEqual(320);
        }
    });

    it('uses the catalog label for the planner', () => {
        expect(buildToolMetadata(ToolId.Planner).title).toEqual(
            expect.stringContaining(toolCatalogEntry(ToolId.Planner).label),
        );
    });
});

describe('buildHubMetadata', () => {
    it('names the firm count and every firm from ALL_FIRMS', () => {
        const metadata = buildHubMetadata();
        expect(ALL_FIRMS.length).toBeGreaterThan(6);
        expect(metadata.description).toEqual(
            expect.stringContaining(`${ALL_FIRMS.length} `),
        );
        for (const firm of ALL_FIRMS) {
            expect(metadata.description).toEqual(
                expect.stringContaining(firm.displayName),
            );
        }
        expect(metadata.alternates?.canonical).toBe(
            routes.propCalculator.index,
        );
        expect(metadata.title).toBe('Prop Firm Calculator');
    });
});
