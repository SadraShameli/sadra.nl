import { type MetadataRoute } from 'next';

import resumeSadra from '~/data/Resume/Sadra';

export default function manifest(): MetadataRoute.Manifest {
    return {
        background_color: '#000',
        description: resumeSadra.description,
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
        name: resumeSadra.basics.title,
        short_name: resumeSadra.title,
        start_url: '/',
        theme_color: '#000',
    };
}
