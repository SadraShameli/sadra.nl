import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    TOOL_CATALOG,
    type ToolCatalogEntry,
    ToolId,
} from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { routes } from '~/lib/site/routes';

import { propCalculatorAppDir } from './appPageFiles';
import { sourceText } from './toolPageFiles';

const SUMMARY_TAG = '<InputsSummary';
const DIALOG_TAG = '<EditInputsDialog';
const FORM_TAG = '<CalculatorInputsForm';
const ROUTE_PREFIX = `${routes.propCalculator.index}/`;

function folderSources(entry: ToolCatalogEntry): string[] {
    const folder = propCalculatorAppDir(
        '(tools)',
        entry.route.slice(ROUTE_PREFIX.length),
    );
    return readdirSync(folder)
        .filter((file) => file.endsWith('.tsx'))
        .map((file) => sourceText(path.join(folder, file)));
}

function isRendered(entry: ToolCatalogEntry, tag: string): boolean {
    return folderSources(entry).some((source) => source.includes(tag));
}

const OWNS_INPUTS_FORM = new Set<ToolId>([ToolId.Simulator]);

const SUMMARY_TOOLS = TOOL_CATALOG.filter(
    (entry) => entry.usesCalculatorInputs && !OWNS_INPUTS_FORM.has(entry.id),
);

const OTHER_TOOLS = TOOL_CATALOG.filter(
    (entry) => !SUMMARY_TOOLS.includes(entry),
);

describe('the inputs summary follows the catalog flag', () => {
    it('finds a view for every catalog tool', () => {
        for (const entry of TOOL_CATALOG) {
            expect(folderSources(entry).length).toBeGreaterThan(0);
        }
    });

    it('has tools on both sides of the flag', () => {
        expect(SUMMARY_TOOLS.length).toBeGreaterThan(0);
        expect(OTHER_TOOLS.length).toBeGreaterThan(0);
    });

    it.each(SUMMARY_TOOLS.map((entry) => [entry.id, entry] as const))(
        'renders InputsSummary on %s, which uses the calculator inputs',
        (_id, entry) => {
            expect(isRendered(entry, SUMMARY_TAG)).toBe(true);
            expect(isRendered(entry, FORM_TAG)).toBe(false);
        },
    );

    it.each(OTHER_TOOLS.map((entry) => [entry.id, entry] as const))(
        'renders neither the summary nor the dialog on %s',
        (_id, entry) => {
            expect(isRendered(entry, SUMMARY_TAG)).toBe(false);
            expect(isRendered(entry, DIALOG_TAG)).toBe(false);
        },
    );

    it('has the simulator own the shared inputs form instead of the summary', () => {
        const simulator = TOOL_CATALOG.find(
            (entry) => entry.id === ToolId.Simulator,
        );
        expect(simulator?.usesCalculatorInputs).toBe(true);
        expect(simulator === undefined || isRendered(simulator, FORM_TAG)).toBe(
            true,
        );
    });

    it('renders the edit dialog nowhere in a tool view, only through the summary', () => {
        for (const entry of TOOL_CATALOG) {
            expect(isRendered(entry, DIALOG_TAG)).toBe(false);
        }
    });
});
