import { type MetadataRoute } from 'next';

import { env } from '~/env';
import { indexableRoutes, routes } from '~/lib/site/routes';

export default function sitemap(): MetadataRoute.Sitemap {
    const base = env.NEXT_PUBLIC_SERVER_URL.replace(/\/$/, '');
    const lastModified = new Date();
    return indexableRoutes.map((path) => ({
        changeFrequency: path === routes.home ? 'weekly' : 'monthly',
        lastModified,
        priority: path === routes.home ? 1 : 0.7,
        url: `${base}${path}`,
    }));
}
