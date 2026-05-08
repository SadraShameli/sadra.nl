import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { GeistSans } from 'geist/font/sans';
import { type Metadata } from 'next';

import { orbitron } from '~/fonts';
import { siteContent } from '~/lib/content';
import { cn } from '~/lib/utils';
import { TRPCReactProvider } from '~/trpc/react';

import GridBackground from '~/components/ui/GridBg';
import Footer from './_components/Footer';
import Navbar from './_components/Navbar';

import '~/styles/styles.css';

export const metadata: Metadata = {
    title: siteContent.metaTitle,
    description: siteContent.metaDescription,
    icons: { icon: '/favicon.ico' },
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className="dark scroll-smooth antialiased">
            <meta name="theme-color" content="#000" />
            <body className={cn(orbitron.variable, GeistSans.variable)}>
                <TRPCReactProvider>
                    <Navbar />
                    <GridBackground />
                    {children}
                    <Footer />
                </TRPCReactProvider>

                <Analytics />
                <SpeedInsights />
            </body>
        </html>
    );
}
