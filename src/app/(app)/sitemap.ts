import { type MetadataRoute } from 'next';
import { cacheLife } from 'next/cache';

import { indexableRoutes, routes } from '~/lib/site/routes';
import { getPublicSiteOrigin } from '~/lib/site/url';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    'use cache';
    cacheLife('days');
    const base = getPublicSiteOrigin();
    return indexableRoutes.map((path) => ({
        changeFrequency: path === routes.home ? 'weekly' : 'monthly',
        priority: path === routes.home ? 1 : 0.7,
        url: `${base}${path}`,
    }));
}
