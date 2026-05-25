import { type MetadataRoute } from 'next';

import { siteContent } from '~/lib/site/content';
import { routes } from '~/lib/site/routes';

export default function manifest(): MetadataRoute.Manifest {
    return {
        background_color: '#000',
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
        theme_color: '#000',
    };
}
