import 'server-only';
import { eq } from 'drizzle-orm';
import { cacheLife, cacheTag, revalidateTag } from 'next/cache';

import { ROOT_EMAIL } from '~/lib/auth/roles';
import { type HeroShowcaseRecord } from '~/lib/site/HeroShowcase';
import { db, siteShowcase, user } from '~/server/db';

enum SiteCacheTag {
    HeroShowcase = 'site-hero-showcase',
}

const SHOWCASE_REVALIDATE_PROFILE = 'max';

export function markHeroShowcaseStale(): void {
    revalidateTag(SiteCacheTag.HeroShowcase, SHOWCASE_REVALIDATE_PROFILE);
}

export async function readOwnerHeroShowcase(): Promise<HeroShowcaseRecord | null> {
    'use cache';
    cacheLife('days');
    cacheTag(SiteCacheTag.HeroShowcase);
    const [row] = await db
        .select({
            averageRHundredths: siteShowcase.averageRHundredths,
            todayProfitAndLossCents: siteShowcase.todayProfitAndLossCents,
            totalPayoutCents: siteShowcase.totalPayoutCents,
            winRatePercent: siteShowcase.winRatePercent,
        })
        .from(siteShowcase)
        .innerJoin(user, eq(user.id, siteShowcase.userId))
        .where(eq(user.email, ROOT_EMAIL))
        .limit(1);
    return row ?? null;
}
