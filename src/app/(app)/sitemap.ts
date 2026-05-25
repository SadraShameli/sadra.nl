import { type MetadataRoute } from 'next';

import { indexableRoutes, routes } from '~/lib/site/routes';
import { getPublicSiteOrigin } from '~/lib/site/url';

export default function sitemap(): MetadataRoute.Sitemap {
    const base = getPublicSiteOrigin();
    const lastModified = new Date();
    return indexableRoutes.map((path) => ({
        changeFrequency: path === routes.home ? 'weekly' : 'monthly',
        lastModified,
        priority: path === routes.home ? 1 : 0.7,
        url: `${base}${path}`,
    }));
}
