import { describe, expect, it, vi } from 'vitest';

import { type HeroShowcaseRecord } from '~/lib/site/HeroShowcase';
import { readOwnerHeroShowcase } from '~/server/site/HeroShowcaseReads';

interface ShowcaseQuery {
    from(): ShowcaseQuery;
    innerJoin(): ShowcaseQuery;
    limit(): Promise<readonly HeroShowcaseRecord[]>;
    where(): ShowcaseQuery;
}

const stored = vi.hoisted((): { rows: readonly HeroShowcaseRecord[] } => ({
    rows: [],
}));

vi.mock('next/cache', () => ({
    cacheLife: vi.fn(),
    cacheTag: vi.fn(),
    revalidateTag: vi.fn(),
}));
vi.mock('~/server/db', async () => {
    const { user } = await import('~/server/db/schemas/auth');
    const { siteShowcase } = await import('~/server/db/schemas/site');
    const query: ShowcaseQuery = {
        from: () => query,
        innerJoin: () => query,
        limit: () => Promise.resolve(stored.rows),
        where: () => query,
    };
    return { db: { select: () => query }, siteShowcase, user };
});

const SAVED_FIGURES: HeroShowcaseRecord = {
    averageRHundredths: 200,
    todayProfitAndLossCents: 500_000,
    totalPayoutCents: 3_000_000,
    winRatePercent: 40,
};

describe('readOwnerHeroShowcase', () => {
    it('returns plain data, since a cached value cannot carry a class instance to the page', async () => {
        stored.rows = [SAVED_FIGURES];

        const figures = await readOwnerHeroShowcase();

        expect(Object.getPrototypeOf(figures)).toBe(Object.prototype);
        expect(figures).toEqual(SAVED_FIGURES);
    });

    it('returns null while the owner has saved no figures', async () => {
        stored.rows = [];

        await expect(readOwnerHeroShowcase()).resolves.toBeNull();
    });
});
