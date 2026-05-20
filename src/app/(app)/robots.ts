import { type MetadataRoute } from 'next';

import { env } from '~/env';
import { disallowedCrawlPaths } from '~/lib/site/routes';

export default function robots(): MetadataRoute.Robots {
    const base = env.NEXT_PUBLIC_SERVER_URL.replace(/\/$/, '');
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
