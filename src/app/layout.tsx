import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { GeistSans } from 'geist/font/sans';
import { type Metadata } from 'next';

import { orbitron } from '~/data/Fonts';
import resumeSadra from '~/data/Resume/Sadra';
import { TRPCReactProvider } from '~/trpc/react';

import GridBackground from '~/components/ui/GridBg';
import Footer from './_components/Footer';
import Navbar from './_components/Navbar';

import '~/styles/globals.css';

export const metadata: Metadata = {
    title: resumeSadra.title,
    description: resumeSadra.description,
    icons: { icon: '/favicon.ico', apple: '/apple-icon.png' },
};

function App({ children }: { children: React.ReactNode }) {
    return (
        <>
            <Navbar />
            <GridBackground />
            {children}
            <Footer />
        </>
    );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className="dark scroll-smooth antialiased">
            <meta name="theme-color" content="#000" />
            <body className={`${orbitron.variable} ${GeistSans.className}`}>
                <TRPCReactProvider>
                    <App>{children}</App>
                </TRPCReactProvider>

                <Analytics />

                <SpeedInsights />
            </body>
        </html>
    );
}
