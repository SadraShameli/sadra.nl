import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { GeistSans } from 'geist/font/sans';
import { type Metadata } from 'next';
import { notFound } from 'next/navigation';

import { orbitron } from '~/fonts';
import { getSiteGlobal, isSiteComplete } from '~/lib/cms';
import { cn } from '~/lib/utils';
import { TRPCReactProvider } from '~/trpc/react';
import type { Site } from '~/payload-types';

import GridBackground from '~/components/ui/GridBg';
import Footer from './_components/Footer';
import Navbar from './_components/Navbar';

import '~/styles/styles.css';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
    const site = await getSiteGlobal();
    if (!isSiteComplete(site)) {
        return {};
    }
    return {
        title: site.metaTitle,
        description: site.metaDescription,
        icons: { icon: '/favicon.ico' },
    };
}

function App({ children, site }: { children: React.ReactNode; site: Site }) {
    return (
        <>
            <Navbar site={site} />
            <GridBackground />
            {children}
            <Footer />
        </>
    );
}

export default async function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const site = await getSiteGlobal();
    if (!isSiteComplete(site)) {
        notFound();
    }

    return (
        <html lang="en" className="dark scroll-smooth antialiased">
            <meta name="theme-color" content="#000" />
            <body className={cn(orbitron.variable, GeistSans.variable)}>
                <TRPCReactProvider>
                    <App site={site}>{children}</App>
                </TRPCReactProvider>

                <Analytics />
                <SpeedInsights />
            </body>
        </html>
    );
}
