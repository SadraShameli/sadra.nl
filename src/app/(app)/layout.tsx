import '~/styles/styles.css';

import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { GeistSans } from 'geist/font/sans';
import { type Metadata, type Viewport } from 'next';

import GridBackground from '~/components/ui/GridBg';
import { Toaster } from '~/components/ui/Sonner';
import { env } from '~/env';
import { orbitron } from '~/fonts';
import { auth } from '~/lib/auth';
import { siteContent } from '~/lib/content';
import { cn } from '~/lib/utils';
import { TRPCReactProvider } from '~/trpc/react';

import Footer from './_components/Footer';
import Navbar from './_components/Navbar';
import ScrollToTop from './_components/ScrollToTop';

export const viewport: Viewport = {
    themeColor: '#000',
};

export const metadata: Metadata = {
    description: siteContent.metaDescription,
    icons: { icon: '/favicon.ico' },
    metadataBase: new URL(env.NEXT_PUBLIC_SERVER_URL),
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

const personJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    description: siteContent.metaDescription,
    jobTitle: siteContent.metaDescription,
    name: siteContent.metaTitle,
    sameAs: siteContent.socialLinks.map((s) => s.url),
    url: env.NEXT_PUBLIC_SERVER_URL,
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
            <body
                className={cn(
                    'app-shell',
                    orbitron.variable,
                    GeistSans.variable,
                )}
            >
                <script
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify(personJsonLd),
                    }}
                    type="application/ld+json"
                />
                <a className="skip-link" href="#main-content">
                    Skip to content
                </a>
                <TRPCReactProvider>
                    <Navbar session={session} />
                    <GridBackground />
                    <div id="main-content">{children}</div>
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
