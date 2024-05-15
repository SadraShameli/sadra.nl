import { SpeedInsights } from '@vercel/speed-insights/next';
import { GeistSans } from 'geist/font/sans';
import { type Metadata } from 'next';

import '~/styles/globals.css';
import { orbitron } from '~/data/Fonts';
import Resume from '~/data/Resume';
import { TRPCReactProvider } from '~/trpc/react';

export const metadata: Metadata = {
    title: Resume.title,
    description: Resume.description,
    icons: { icon: '/favicon.ico', apple: '/apple-icon.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang='en' className='scroll-smooth bg-black antialiased'>
            <meta name='theme-color' content='#000' />
            <body className={`dark:text-neutral-300 ${orbitron.variable} ${GeistSans.className}`}>
                <TRPCReactProvider>{children}</TRPCReactProvider>
                <SpeedInsights />
            </body>
        </html>
    );
}
