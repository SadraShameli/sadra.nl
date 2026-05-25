import { siteContent } from '~/lib/site/content';
import { getPublicSiteOrigin } from '~/lib/site/url';

import ScrollToTop from './_components/ScrollToTop';

const personJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    description: siteContent.metaDescription,
    jobTitle: siteContent.metaDescription,
    name: siteContent.metaTitle,
    sameAs: siteContent.socialLinks.map((s) => s.url),
    url: getPublicSiteOrigin(),
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <script
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify(personJsonLd),
                }}
                type="application/ld+json"
            />
            <a className="skip-link" href="#main-content">
                Skip to content
            </a>
            {children}
            <ScrollToTop />
        </>
    );
}
