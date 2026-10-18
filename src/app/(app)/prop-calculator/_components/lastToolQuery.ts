import {
    type KeyValueStorage,
    sessionStorageOrNull,
} from '~/app/(app)/prop-calculator/_components/browserStorage';

const LAST_TOOL_QUERY_KEY = 'propCalc.lastToolQuery.v1';

export function readLastToolQuery(
    storage: KeyValueStorage | null = sessionStorageOrNull(),
): null | string {
    if (storage === null) return null;
    try {
        const raw = storage.getItem(LAST_TOOL_QUERY_KEY);
        return raw === null ? null : normalizedQuery(raw);
    } catch {
        return null;
    }
}

export function writeLastToolQuery(
    query: string,
    storage: KeyValueStorage | null = sessionStorageOrNull(),
): void {
    if (storage === null) return;
    try {
        storage.setItem(LAST_TOOL_QUERY_KEY, normalizedQuery(query) ?? '');
    } catch {
        return;
    }
}

function normalizedQuery(raw: string): null | string {
    const query = new URLSearchParams(raw).toString();
    return query === '' ? null : query;
}
