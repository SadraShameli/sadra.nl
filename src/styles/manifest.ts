import { MetadataRoute } from 'next';
import Resume from '~/data/Resume';

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: Resume.title,
        short_name: Resume.title,
        description: Resume.description,
        start_url: '/',
        display: 'minimal-ui',
        background_color: '#fff',
        theme_color: '#fff',
        icons: [
            {
                src: '/favicon.ico',
                sizes: 'any',
                type: 'image/x-icon',
            },
            {
                src: '/static/icons/android-chrome-192x192.png',
                sizes: '192x192',
                type: 'image/png',
            },
            {
                src: '/static/icons/android-chrome-512x512.png',
                sizes: '512x512',
                type: 'image/png',
            },
        ],
    };
}
