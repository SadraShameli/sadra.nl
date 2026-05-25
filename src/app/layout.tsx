import '~/styles/styles.css';

import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { GeistSans } from 'geist/font/sans';
import { type Metadata, type Viewport } from 'next';

import GridBackground from '~/components/ui/GridBg';
import { Toaster } from '~/components/ui/Sonner';
import { orbitron } from '~/fonts';
import { getServerSession } from '~/lib/auth/server';
import { siteContent } from '~/lib/site/content';
import { getPublicSiteOrigin } from '~/lib/site/url';
import { cn } from '~/lib/utils';
import { TRPCReactProvider } from '~/trpc/react';

import Footer from './(app)/_components/Footer';
import Navbar from './(app)/_components/Navbar';

export const viewport: Viewport = {
    themeColor: '#000',
};

const siteOrigin = getPublicSiteOrigin();

export const metadata: Metadata = {
    description: siteContent.metaDescription,
    icons: { icon: '/favicon.ico' },
    metadataBase: new URL(siteOrigin),
    openGraph: {
        description: siteContent.metaDescription,
        siteName: 'sadra.nl',
        title: siteContent.metaTitle,
        type: 'website',
    },
    title: {
        default: siteContent.metaTitle,
        template: `%s · ${siteContent.metaTitle}`,
    },
    twitter: {
        card: 'summary_large_image',
        description: siteContent.metaDescription,
        title: siteContent.metaTitle,
    },
};

export default async function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getServerSession();

    return (
        <html
            className="dark scroll-smooth antialiased"
            data-scroll-behavior="smooth"
            lang="en"
        >
            <body
                className={cn(
                    'app-shell',
                    'flex min-h-screen flex-col',
                    orbitron.variable,
                    GeistSans.variable,
                )}
            >
                <TRPCReactProvider>
                    <Navbar session={session} />
                    <GridBackground />
                    <div className="flex flex-1 flex-col" id="main-content">
                        {children}
                    </div>
                    <Footer />
                </TRPCReactProvider>
                <Toaster position="bottom-center" richColors />
                <Analytics />
                <SpeedInsights />
            </body>
        </html>
    );
}
