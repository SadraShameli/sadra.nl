import '~/styles/styles.css';

import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { GeistSans } from 'geist/font/sans';
import { type Metadata } from 'next';

import GridBackground from '~/components/ui/GridBg';
import { Toaster } from '~/components/ui/Sonner';
import { orbitron } from '~/fonts';
import { auth } from '~/lib/auth';
import { siteContent } from '~/lib/content';
import { cn } from '~/lib/utils';
import { TRPCReactProvider } from '~/trpc/react';

import Footer from './_components/Footer';
import Navbar from './_components/Navbar';
import ScrollToTop from './_components/ScrollToTop';

export const metadata: Metadata = {
    description: siteContent.metaDescription,
    icons: { icon: '/favicon.ico' },
    title: siteContent.metaTitle,
};

export default async function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();

    return (
        <html
            className="dark scroll-smooth antialiased"
            data-scroll-behavior="smooth"
            lang="en"
        >
            <meta content="#000" name="theme-color" />
            <body
                className={cn(
                    'app-shell',
                    orbitron.variable,
                    GeistSans.variable,
                )}
            >
                <TRPCReactProvider>
                    <Navbar session={session} />
                    <GridBackground />
                    {children}
                    <Footer />
                </TRPCReactProvider>

                <Toaster position="bottom-center" richColors />
                <ScrollToTop />
                <Analytics />
                <SpeedInsights />
            </body>
        </html>
    );
}
