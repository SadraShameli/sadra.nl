import { type Metadata } from 'next';
import { SpeedInsights } from '@vercel/speed-insights/next';

import '~/styles/globals.css';
import { defaultFont, orbitron } from '~/assets/fonts';
import Resume from '~/data/Resume';

export const metadata: Metadata = {
    title: Resume.title,
    description: Resume.description,
    icons: [
        { rel: 'icon', url: '/favicon.ico' },
        { rel: 'apple-touch-icon', sizes: '180x180', url: '/static/icons/apple-touch-icon.png' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', url: '/static/icons/favicon-32x32.png' },
        { rel: 'icon', type: 'image/png', sizes: '16x16', url: '/static/icons/favicon-16x16.png' },
        {
            sizes: '192x192',
            type: 'image/png',
            url: '/static/icons/android-chrome-192x192.png',
        },
        {
            sizes: '512x512',
            type: 'image/png',
            url: '/static/icons/android-chrome-512x512.png',
        },
    ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang='en' className='scroll-smooth bg-black antialiased'>
            <body className={`${orbitron.variable} ${defaultFont.variable} font-sans`}>
                {children}
                <SpeedInsights />
            </body>
        </html>
    );
}
