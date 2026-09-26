import { describe, expect, expectTypeOf, it } from 'vitest';

import type { ToolPageHeadingProperties } from '~/app/(app)/prop-calculator/_components/ToolPageHeading';

import { panelDescriptions } from '~/app/(app)/prop-calculator/_components/kpiDescriptions';
import {
    isCalculatorInputsPath,
    type OwnCodecToolId,
    TOOL_CATALOG,
    toolCatalogEntry,
    toolForPathname,
    ToolGroup,
    ToolId,
    ToolUrlCodec,
} from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { routes } from '~/lib/site/routes';

const SPLIT_TOOLS: readonly ToolId[] = [
    ToolId.Simulator,
    ToolId.Analysis,
    ToolId.Sizing,
    ToolId.Compare,
    ToolId.CashFlow,
    ToolId.LadderLab,
    ToolId.StrategyLab,
    ToolId.Planner,
];

function byName(a: string, b: string): number {
    return a.localeCompare(b);
}

function toolRouteValues(): string[] {
    const values: string[] = [];
    for (const [name, value] of Object.entries(routes.propCalculator)) {
        if (typeof value === 'string' && name !== 'index') values.push(value);
    }
    return values;
}

describe('TOOL_CATALOG', () => {
    it('has exactly one entry per ToolId', () => {
        const ids = TOOL_CATALOG.map((entry) => entry.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids.toSorted(byName)).toEqual(
            Object.values(ToolId).toSorted(byName),
        );
    });

    it('has unique routes, each a routes.propCalculator tool value', () => {
        const toolRoutes = toolRouteValues();
        const catalogRoutes = TOOL_CATALOG.map((entry) => entry.route);
        expect(new Set(catalogRoutes).size).toBe(catalogRoutes.length);
        for (const route of catalogRoutes) {
            expect(toolRoutes).toContain(route);
        }
        expect(catalogRoutes.toSorted(byName)).toEqual(
            toolRoutes.toSorted(byName),
        );
    });

    it('never puts a query or fragment in a base route', () => {
        for (const entry of TOOL_CATALOG) {
            expect(entry.route).not.toContain('?');
            expect(entry.route).not.toContain('#');
        }
    });

    it('gives every entry a label, a non-empty blurb, an icon and a group', () => {
        const groups = Object.values(ToolGroup);
        for (const entry of TOOL_CATALOG) {
            expect(entry.label.trim().length).toBeGreaterThan(0);
            expect(entry.blurb.trim().length).toBeGreaterThan(0);
            expect(entry.icon).toBeTruthy();
            expect(groups).toContain(entry.group);
        }
    });

    it('has unique labels', () => {
        const labels = TOOL_CATALOG.map((entry) => entry.label);
        expect(new Set(labels).size).toBe(labels.length);
    });

    it('reuses the existing planner panel description', () => {
        expect(toolCatalogEntry(ToolId.Planner).blurb).toBe(
            panelDescriptions.portfolio,
        );
        expect(toolCatalogEntry(ToolId.Planner).label).toBe(
            'Multi-firm planner',
        );
    });

    it('marks the split tools, funded optimizer and live as calculator-input tools that share state', () => {
        for (const id of [
            ...SPLIT_TOOLS,
            ToolId.FundedOptimizer,
            ToolId.Live,
        ]) {
            const entry = toolCatalogEntry(id);
            expect(entry.usesCalculatorInputs).toBe(true);
            expect(entry.sharesState).toBe(true);
            expect(entry.ownUrlCodec).toBeNull();
        }
    });

    it('gives position size and payout planner their own codec instead of calculator inputs', () => {
        expect(toolCatalogEntry(ToolId.PositionSize)).toMatchObject({
            ownUrlCodec: ToolUrlCodec.PositionSize,
            sharesState: true,
            usesCalculatorInputs: false,
        });
        expect(toolCatalogEntry(ToolId.PayoutPlanner)).toMatchObject({
            ownUrlCodec: ToolUrlCodec.PayoutPlanner,
            sharesState: true,
            usesCalculatorInputs: false,
        });
    });

    it('lets the rules browser share nothing', () => {
        expect(toolCatalogEntry(ToolId.Rules)).toMatchObject({
            ownUrlCodec: null,
            sharesState: false,
            usesCalculatorInputs: false,
        });
    });

    it('types exactly the own-codec tools as OwnCodecToolId', () => {
        expectTypeOf<OwnCodecToolId>().toEqualTypeOf<
            ToolId.PayoutPlanner | ToolId.PositionSize
        >();
        const ownCodecIds = TOOL_CATALOG.filter(
            (entry) => entry.ownUrlCodec !== null,
        ).map((entry) => entry.id);
        expect(ownCodecIds.toSorted(byName)).toEqual(
            [ToolId.PayoutPlanner, ToolId.PositionSize].toSorted(byName),
        );
    });

    it('requires the tool query on the heading of an own-codec tool and forbids it elsewhere', () => {
        expectTypeOf<{
            ownQuery: string;
            toolId: ToolId.PositionSize;
        }>().toExtend<ToolPageHeadingProperties>();
        expectTypeOf<{
            toolId: ToolId.PositionSize;
        }>().not.toExtend<ToolPageHeadingProperties>();
        expectTypeOf<{
            toolId: ToolId.PayoutPlanner;
        }>().not.toExtend<ToolPageHeadingProperties>();
        expectTypeOf<{
            toolId: ToolId.Simulator;
        }>().toExtend<ToolPageHeadingProperties>();
        expectTypeOf<{
            ownQuery: string;
            toolId: ToolId.Simulator;
        }>().not.toExtend<ToolPageHeadingProperties>();
    });

    it('never gives an own codec to a calculator-input tool', () => {
        for (const entry of TOOL_CATALOG) {
            if (entry.usesCalculatorInputs) {
                expect(entry.ownUrlCodec).toBeNull();
            }
        }
    });
});

describe('toolForPathname', () => {
    it('resolves each tool route to its entry', () => {
        for (const entry of TOOL_CATALOG) {
            expect(toolForPathname(entry.route)?.id).toBe(entry.id);
        }
    });

    it('returns null for the hub, accounts and unknown paths', () => {
        expect(toolForPathname(routes.propCalculator.index)).toBeNull();
        expect(
            toolForPathname(routes.propCalculator.accounts.index),
        ).toBeNull();
        expect(toolForPathname('/prop-calculator/simulator/x')).toBeNull();
        expect(toolForPathname('')).toBeNull();
    });
});

describe('isCalculatorInputsPath', () => {
    it('follows the catalog flag', () => {
        expect(isCalculatorInputsPath(routes.propCalculator.analysis)).toBe(
            true,
        );
        expect(isCalculatorInputsPath(routes.propCalculator.live)).toBe(true);
        expect(isCalculatorInputsPath(routes.propCalculator.rules)).toBe(false);
        expect(isCalculatorInputsPath(routes.propCalculator.positionSize)).toBe(
            false,
        );
        expect(isCalculatorInputsPath(routes.propCalculator.index)).toBe(false);
        expect(isCalculatorInputsPath('/somewhere')).toBe(false);
    });
});
