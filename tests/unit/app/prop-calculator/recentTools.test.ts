import { describe, expect, it } from 'vitest';

import { type KeyValueStorage } from '~/app/(app)/prop-calculator/_components/browserStorage';
import {
    readRecentTools,
    RECENT_TOOLS_LIMIT,
    recentToolLinks,
    recordToolVisit,
    withRecentTool,
} from '~/app/(app)/prop-calculator/_components/hub/recentTools';
import {
    TOOL_CATALOG,
    toolCatalogEntry,
    ToolId,
} from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { routes } from '~/lib/site/routes';

class MemoryStorage implements KeyValueStorage {
    readonly values = new Map<string, string>();

    getItem(key: string): null | string {
        return this.values.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        this.values.set(key, value);
    }
}

const throwingStorage: KeyValueStorage = {
    getItem() {
        throw new Error('SecurityError');
    },
    setItem() {
        throw new Error('QuotaExceededError');
    },
};

function storedAs(raw: string): MemoryStorage {
    const storage = new MemoryStorage();
    recordToolVisit(routes.propCalculator.simulator, storage);
    expect(storage.values.size).toBe(1);
    for (const key of storage.values.keys()) storage.setItem(key, raw);
    return storage;
}

describe('withRecentTool', () => {
    it('puts the visited tool first and keeps the rest in order', () => {
        expect(
            withRecentTool([ToolId.Analysis, ToolId.Sizing], ToolId.Compare),
        ).toEqual([ToolId.Compare, ToolId.Analysis, ToolId.Sizing]);
    });

    it('moves a tool already in the list to the front without duplicating it', () => {
        expect(
            withRecentTool(
                [ToolId.Analysis, ToolId.Sizing, ToolId.Compare],
                ToolId.Sizing,
            ),
        ).toEqual([ToolId.Sizing, ToolId.Analysis, ToolId.Compare]);
    });

    it('keeps at most 5 tools and drops the least recent', () => {
        expect(RECENT_TOOLS_LIMIT).toBe(5);
        const full = [
            ToolId.Simulator,
            ToolId.Analysis,
            ToolId.Sizing,
            ToolId.Compare,
            ToolId.CashFlow,
        ];
        expect(withRecentTool(full, ToolId.LadderLab)).toEqual([
            ToolId.LadderLab,
            ToolId.Simulator,
            ToolId.Analysis,
            ToolId.Sizing,
            ToolId.Compare,
        ]);
    });
});

describe('recordToolVisit and readRecentTools', () => {
    it('records tool pages most recent first and reads them back', () => {
        const storage = new MemoryStorage();
        recordToolVisit(routes.propCalculator.simulator, storage);
        recordToolVisit(routes.propCalculator.compare, storage);
        recordToolVisit(routes.propCalculator.simulator, storage);
        expect(readRecentTools(storage)).toEqual([
            ToolId.Simulator,
            ToolId.Compare,
        ]);
        expect(storage.values.size).toBe(1);
    });

    it('keeps an MRU of 5 across 7 distinct visits', () => {
        const storage = new MemoryStorage();
        const visits = [
            ToolId.Simulator,
            ToolId.Analysis,
            ToolId.Sizing,
            ToolId.Compare,
            ToolId.CashFlow,
            ToolId.LadderLab,
            ToolId.StrategyLab,
        ];
        for (const id of visits) {
            recordToolVisit(toolCatalogEntry(id).route, storage);
        }
        expect(readRecentTools(storage)).toEqual([
            ToolId.StrategyLab,
            ToolId.LadderLab,
            ToolId.CashFlow,
            ToolId.Compare,
            ToolId.Sizing,
        ]);
    });

    it('returns the updated list from a visit', () => {
        const storage = new MemoryStorage();
        recordToolVisit(routes.propCalculator.sizing, storage);
        expect(
            recordToolVisit(routes.propCalculator.analysis, storage),
        ).toEqual([ToolId.Analysis, ToolId.Sizing]);
    });

    it('records nothing for a path that is not a tool page', () => {
        const storage = new MemoryStorage();
        for (const pathname of [
            routes.propCalculator.index,
            routes.propCalculator.accounts.index,
            routes.propCalculator.accounts.new,
            '/elsewhere',
        ]) {
            recordToolVisit(pathname, storage);
        }
        expect(storage.values.size).toBe(0);
        expect(readRecentTools(storage)).toEqual([]);
    });

    it.skipIf(TOOL_CATALOG.every((entry) => entry.hasPage))(
        'records nothing for a catalog tool that has no page yet',
        () => {
            const unbuilt = TOOL_CATALOG.filter((entry) => !entry.hasPage);
            const storage = new MemoryStorage();
            for (const entry of unbuilt) recordToolVisit(entry.route, storage);
            expect(readRecentTools(storage)).toEqual([]);
        },
    );

    it('returns an empty list when nothing was recorded', () => {
        expect(readRecentTools(new MemoryStorage())).toEqual([]);
    });
});

describe('corrupt or unavailable storage is ignored', () => {
    it.each([
        ['invalid JSON', '{not json'],
        ['a JSON object', '{"0":"simulator"}'],
        ['a JSON string', '"simulator"'],
        ['JSON null', 'null'],
        ['a number', '42'],
        ['an empty string', ''],
    ])('reads %s as no recent tools', (_, raw) => {
        expect(readRecentTools(storedAs(raw))).toEqual([]);
    });

    it('drops unknown ids, non-strings and duplicates from a stored array and caps it at 5', () => {
        const raw = JSON.stringify([
            'compare',
            'not-a-tool',
            7,
            null,
            'compare',
            'simulator',
            { id: 'sizing' },
            'analysis',
            'sizing',
            'cash-flow',
            'ladder-lab',
        ]);
        expect(readRecentTools(storedAs(raw))).toEqual([
            ToolId.Compare,
            ToolId.Simulator,
            ToolId.Analysis,
            ToolId.Sizing,
            ToolId.CashFlow,
        ]);
    });

    it('overwrites a corrupt value on the next visit', () => {
        const storage = storedAs('{not json');
        recordToolVisit(routes.propCalculator.compare, storage);
        expect(readRecentTools(storage)).toEqual([ToolId.Compare]);
    });

    it('never throws with a throwing storage', () => {
        expect(readRecentTools(throwingStorage)).toEqual([]);
        expect(() =>
            recordToolVisit(routes.propCalculator.simulator, throwingStorage),
        ).not.toThrow();
    });

    it('returns an empty list without any storage', () => {
        expect(readRecentTools(null)).toEqual([]);
        expect(() =>
            recordToolVisit(routes.propCalculator.simulator, null),
        ).not.toThrow();
    });

    it('reads nothing in a non-browser environment by default', () => {
        expect(readRecentTools()).toEqual([]);
        expect(() =>
            recordToolVisit(routes.propCalculator.simulator),
        ).not.toThrow();
    });
});

describe('recentToolLinks', () => {
    it('maps the recent ids to their catalog entries in recency order', () => {
        expect(
            recentToolLinks([ToolId.Compare, ToolId.Simulator]).map(
                (entry) => entry.id,
            ),
        ).toEqual([ToolId.Compare, ToolId.Simulator]);
    });

    it.skipIf(TOOL_CATALOG.every((entry) => entry.hasPage))(
        'drops a tool whose page does not exist, so the hub never links to a missing page',
        () => {
            const unbuilt = TOOL_CATALOG.find((entry) => !entry.hasPage);
            if (unbuilt === undefined) throw new Error('every tool has a page');
            expect(
                recentToolLinks([unbuilt.id, ToolId.Sizing]).map(
                    (entry) => entry.id,
                ),
            ).toEqual([ToolId.Sizing]);
        },
    );
});
