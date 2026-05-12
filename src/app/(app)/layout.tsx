import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { GeistSans } from 'geist/font/sans';
import { type Metadata } from 'next';

import { auth } from '~/lib/auth';
import { orbitron } from '~/fonts';
import { siteContent } from '~/lib/content';
import { cn } from '~/lib/utils';
import { TRPCReactProvider } from '~/trpc/react';

import GridBackground from '~/components/ui/GridBg';
import Footer from './_components/Footer';
import Navbar from './_components/Navbar';
import ScrollToTop from './_components/ScrollToTop';

import '~/styles/styles.css';

export const metadata: Metadata = {
    title: siteContent.metaTitle,
    description: siteContent.metaDescription,
    icons: { icon: '/favicon.ico' },
};

export default async function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();

    return (
        <html lang="en" className="dark scroll-smooth antialiased">
            <meta name="theme-color" content="#000" />
            <body className={cn(orbitron.variable, GeistSans.variable)}>
                <TRPCReactProvider>
                    <Navbar session={session} />
                    <GridBackground />
                    {children}
                    <Footer />
                </TRPCReactProvider>

                <ScrollToTop />
                <Analytics />
                <SpeedInsights />
            </body>
        </html>
    );
}
