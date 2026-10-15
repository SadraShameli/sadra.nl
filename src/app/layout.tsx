import '~/styles/styles.css';

import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { type Metadata, type Viewport } from 'next';
import { Suspense } from 'react';

import GridBackground from '~/components/ui/GridBg';
import { Toaster } from '~/components/ui/Sonner';
import { nunito, orbitron } from '~/fonts';
import { siteContent } from '~/lib/site/content';
import { SITE_NAME } from '~/lib/site/siteName';
import { getPublicSiteOrigin } from '~/lib/site/url';
import { cn } from '~/lib/utilities';
import { TRPCReactProvider } from '~/trpc/react';

import { AccountLink } from './(app)/_components/AccountLink';
import Footer from './(app)/_components/Footer';
import Navbar from './(app)/_components/Navbar';
import { SessionAccountLink } from './(app)/_components/SessionAccountLink';

export const viewport: Viewport = {
    themeColor: '#000',
};

const siteOrigin = getPublicSiteOrigin();

export const metadata: Metadata = {
    description: siteContent.metaDescription,
    metadataBase: new URL(siteOrigin),
    openGraph: {
        description: siteContent.metaDescription,
        siteName: SITE_NAME,
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

export default function RootLayout({ children }: LayoutProps<'/'>) {
    return (
        <html
            className={cn('dark scroll-smooth antialiased', nunito.variable)}
            data-scroll-behavior="smooth"
            lang="en"
        >
            <body
                className={cn(
                    'app-shell',
                    'flex min-h-screen flex-col',
                    orbitron.variable,
                )}
            >
                <TRPCReactProvider>
                    <Navbar
                        accountLink={
                            <Suspense
                                fallback={<AccountLink signedIn={false} />}
                            >
                                <SessionAccountLink />
                            </Suspense>
                        }
                    />
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
