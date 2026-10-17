import '~/styles/styles.css';

import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { type Metadata, type Viewport } from 'next';
import { ThemeProvider } from 'next-themes';
import { Suspense } from 'react';

import { MeshBackground } from '~/components/MeshBackground';
import { Toaster } from '~/components/ui/Sonner';
import { bodoniModa, hankenGrotesk, jetBrainsMono } from '~/fonts';
import { siteContent } from '~/lib/site/content';
import { SITE_NAME } from '~/lib/site/siteName';
import { THEME_BACKGROUND_COLOR } from '~/lib/site/themeColor';
import { getPublicSiteOrigin } from '~/lib/site/url';
import { DEFAULT_COLOR_MODE } from '~/lib/theme';
import { cn } from '~/lib/utilities';
import { TRPCReactProvider } from '~/trpc/react';

import { AccountLink } from './(app)/_components/AccountLink';
import Footer from './(app)/_components/Footer';
import { MAIN_CONTENT_ID } from './(app)/_components/mainContent';
import Navbar from './(app)/_components/Navbar';
import { SessionAccountLink } from './(app)/_components/SessionAccountLink';

export const viewport: Viewport = {
    themeColor: THEME_BACKGROUND_COLOR,
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
            className={cn(
                'scroll-smooth antialiased',
                bodoniModa.variable,
                hankenGrotesk.variable,
                jetBrainsMono.variable,
            )}
            data-scroll-behavior="smooth"
            lang="en"
            suppressHydrationWarning
        >
            <body className={cn('app-shell', 'flex min-h-screen flex-col')}>
                <ThemeProvider
                    attribute="class"
                    defaultTheme={DEFAULT_COLOR_MODE}
                    disableTransitionOnChange
                    enableSystem={false}
                >
                    <MeshBackground />
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
                        <div
                            className="flex flex-1 flex-col"
                            id={MAIN_CONTENT_ID}
                        >
                            {children}
                        </div>
                        <Footer />
                    </TRPCReactProvider>
                    <Toaster position="bottom-center" richColors />
                </ThemeProvider>
                <Analytics />
                <SpeedInsights />
            </body>
        </html>
    );
}
