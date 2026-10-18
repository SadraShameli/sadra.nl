import type * as NextCache from 'next/cache';
import type * as NextServer from 'next/server';

import { vi } from 'vitest';

export async function nextCacheWithoutCacheComponents(
    importOriginal: () => Promise<typeof NextCache>,
): Promise<typeof NextCache> {
    return { ...(await importOriginal()), cacheLife: vi.fn() };
}

export async function nextServerWithoutConnection(
    importOriginal: () => Promise<typeof NextServer>,
): Promise<typeof NextServer> {
    return {
        ...(await importOriginal()),
        connection: vi.fn(() => Promise.resolve()),
    };
}
