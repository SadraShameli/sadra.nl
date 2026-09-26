import { z } from 'zod';

import {
    type KeyValueStorage,
    localStorageOrNull,
} from '~/app/(app)/prop-calculator/_components/browserStorage';
import {
    LINKED_TOOL_CATALOG,
    type ToolCatalogEntry,
    toolForPathname,
    ToolId,
} from '~/app/(app)/prop-calculator/_components/toolCatalog';

export const RECENT_TOOLS_LIMIT = 5;

const RECENT_TOOLS_KEY = 'propCalc.recentTools.v1';

const toolIdSchema = z.enum(ToolId);

const storedRecentToolsSchema = z.array(z.unknown()).transform((entries) =>
    entries.reduce<readonly ToolId[]>((recent, entry) => {
        const parsed = toolIdSchema.safeParse(entry);
        return parsed.success && !recent.includes(parsed.data)
            ? [...recent, parsed.data]
            : recent;
    }, []),
);

export function readRecentTools(
    storage: KeyValueStorage | null = localStorageOrNull(),
): readonly ToolId[] {
    if (storage === null) return [];
    try {
        const raw = storage.getItem(RECENT_TOOLS_KEY);
        if (raw === null) return [];
        const parsed = storedRecentToolsSchema.safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data.slice(0, RECENT_TOOLS_LIMIT) : [];
    } catch {
        return [];
    }
}

export function recentToolLinks(
    ids: readonly ToolId[],
): readonly ToolCatalogEntry[] {
    return ids.flatMap((id) => {
        const entry = LINKED_TOOL_CATALOG.find(
            (candidate) => candidate.id === id,
        );
        return entry === undefined ? [] : [entry];
    });
}

export function recordToolVisit(
    pathname: string,
    storage: KeyValueStorage | null = localStorageOrNull(),
): readonly ToolId[] {
    const recent = readRecentTools(storage);
    const entry = toolForPathname(pathname);
    if (storage === null || !entry?.hasPage) return recent;
    const next = withRecentTool(recent, entry.id);
    try {
        storage.setItem(RECENT_TOOLS_KEY, JSON.stringify(next));
    } catch {
        return recent;
    }
    return next;
}

export function withRecentTool(
    recent: readonly ToolId[],
    toolId: ToolId,
): readonly ToolId[] {
    return [toolId, ...recent.filter((id) => id !== toolId)].slice(
        0,
        RECENT_TOOLS_LIMIT,
    );
}
