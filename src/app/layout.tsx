import { Metadata } from 'next';
import Script from 'next/script';
import { Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';

import Resume from '~/data/Resume';

import '~/styles/globals.css';

const GOOGLE_ANALYTICS_ID = 'G-RC2BS5NY0W';

const inter = Inter({
    subsets: ['latin'],
    variable: '--font-sans',
});

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
        <html lang='en'>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}`} strategy='afterInteractive' />
            <Script id='google-analytics' strategy='afterInteractive'>
                {`window.dataLayer = window.dataLayer || [];function gtag(){window.dataLayer.push(arguments);}
                    gtag('js', new Date());gtag('config', '${GOOGLE_ANALYTICS_ID}');`}
            </Script>
            <body className={`font-sans ${inter.variable}`}>
                {children}
                <Analytics />
            </body>
        </html>
    );
}
