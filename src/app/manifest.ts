import { type MetadataRoute } from 'next';

import Resume from '~/data/Resume';

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: Resume.basics.title,
        short_name: Resume.title,
        description: Resume.description,
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
                src: '/maskable_icon.png',
                sizes: '196x196',
                type: 'image/png',
                purpose: 'maskable',
            },
            {
                src: '/icon-512x.png',
                sizes: '512x512',
                type: 'image/png',
            },
        ],
    };
}
