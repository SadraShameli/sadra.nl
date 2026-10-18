import { type MetadataRoute } from 'next';

import { siteContent } from '~/lib/site/content';
import { routes } from '~/lib/site/routes';
import { THEME_BACKGROUND_COLOR } from '~/lib/site/themeColor';

export default function manifest(): MetadataRoute.Manifest {
    return {
        background_color: THEME_BACKGROUND_COLOR,
        description: siteContent.manifest.description,
        display: 'standalone',
        icons: [
            {
                sizes: '32x32',
                src: '/favicon.ico',
                type: 'image/x-icon',
            },
            {
                sizes: '512x512',
                src: '/favicon-512x.png',
                type: 'image/png',
            },
        ],
        name: siteContent.manifest.name,
        short_name: siteContent.manifest.shortName,
        start_url: routes.home,
        theme_color: THEME_BACKGROUND_COLOR,
    };
}
