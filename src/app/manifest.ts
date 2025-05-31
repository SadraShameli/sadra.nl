import { type MetadataRoute } from 'next';

import resumeSadra from '~/data/Resume/Sadra';

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: resumeSadra.basics.title,
        short_name: resumeSadra.title,
        description: resumeSadra.description,
        start_url: '/',
        display: 'standalone',
        background_color: '#000',
        theme_color: '#000',
        icons: [
            {
                src: '/favicon.ico',
                sizes: '32x32',
                type: 'image/x-icon',
            },
            {
                src: '/favicon-512x.png',
                sizes: '512x512',
                type: 'image/png',
            },
        ],
    };
}
