import { SpeedInsights } from '@vercel/speed-insights/next';
import { GeistSans } from 'geist/font/sans';
import { type Metadata } from 'next';

import '~/styles/globals.css';
import BackgroundSnipper from '~/components/BackgroundSnippet';
import { orbitron } from '~/data/Fonts';
import Resume from '~/data/Resume';
import { TRPCReactProvider } from '~/trpc/react';

import Navbar from './components/Navbar';

export const metadata: Metadata = {
    title: Resume.title,
    icons: { icon: '/favicon.ico', apple: '/apple-icon.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang='en' className='scroll-smooth bg-black antialiased'>
            <body className={`dark:text-neutral-300 ${orbitron.variable} ${GeistSans.className}`}>
                <TRPCReactProvider>
                    <Overlays />
                    {children}
                </TRPCReactProvider>
                <SpeedInsights />
            </body>
        </html>
    );
}

function Overlays() {
    return (
        <>
            <Navbar />
            <BackgroundSnipper />
        </>
    );
}
