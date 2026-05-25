import { type MetadataRoute } from 'next';

import { disallowedCrawlPaths } from '~/lib/site/routes';
import { getPublicSiteOrigin } from '~/lib/site/url';

export default function robots(): MetadataRoute.Robots {
    const base = getPublicSiteOrigin();
    return {
        host: base,
        rules: [
            {
                allow: '/',
                disallow: [...disallowedCrawlPaths],
                userAgent: '*',
            },
        ],
        sitemap: `${base}/sitemap.xml`,
    };
}
