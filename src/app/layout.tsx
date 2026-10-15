import '~/styles/styles.css';

import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { type Metadata, type Viewport } from 'next';
import { ThemeProvider } from 'next-themes';
import Script from 'next/script';
import { Suspense } from 'react';

import { Toaster } from '~/components/ui/Sonner';
import { jetBrainsMono, orbitron, plusJakartaSans } from '~/fonts';
import { siteContent } from '~/lib/site/content';
import { SITE_NAME } from '~/lib/site/siteName';
import { THEME_BACKGROUND_COLOR } from '~/lib/site/themeColor';
import { getPublicSiteOrigin } from '~/lib/site/url';
import { browserThemeBootScript, DEFAULT_COLOR_MODE } from '~/lib/theme';
import { cn } from '~/lib/utilities';
import { TRPCReactProvider } from '~/trpc/react';

import { AccountLink } from './(app)/_components/AccountLink';
import Footer from './(app)/_components/Footer';
import Navbar from './(app)/_components/Navbar';
import { SessionAccountLink } from './(app)/_components/SessionAccountLink';
import { SessionThemeSync } from './(app)/_components/SessionThemeSync';

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
                plusJakartaSans.variable,
                jetBrainsMono.variable,
            )}
            data-scroll-behavior="smooth"
            lang="en"
            suppressHydrationWarning
        >
            <head>
                <Script id="user-theme-boot" strategy="beforeInteractive">
                    {browserThemeBootScript()}
                </Script>
            </head>
            <body
                className={cn(
                    'app-shell',
                    'flex min-h-screen flex-col',
                    orbitron.variable,
                )}
            >
                <ThemeProvider
                    attribute="class"
                    defaultTheme={DEFAULT_COLOR_MODE}
                    disableTransitionOnChange
                    enableSystem={false}
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
                        <div className="flex flex-1 flex-col" id="main-content">
                            {children}
                        </div>
                        <Footer />
                        <Suspense fallback={null}>
                            <SessionThemeSync />
                        </Suspense>
                    </TRPCReactProvider>
                    <Toaster position="bottom-center" richColors />
                </ThemeProvider>
                <Analytics />
                <SpeedInsights />
            </body>
        </html>
    );
}
