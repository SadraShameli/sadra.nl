import AvatarImage from '~/assets/images/sadra-portrait.jpg';
import { NavigationBlockerProvider } from '~/components/NavigationBlocker';
import { siteContent } from '~/lib/site/content';
import { serializeJsonLd } from '~/lib/site/jsonLd';
import { SITE_NAME } from '~/lib/site/siteName';
import { getPublicSiteOrigin } from '~/lib/site/url';

import { MAIN_CONTENT_ID } from './_components/mainContent';
import ScrollToTop from './_components/ScrollToTop';

const siteOrigin = getPublicSiteOrigin();
const personId = `${siteOrigin}/#person`;

const identityJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
        {
            '@id': personId,
            '@type': 'Person',
            description: siteContent.metaDescription,
            image: new URL(AvatarImage.src, siteOrigin).href,
            jobTitle: siteContent.manifest.description,
            name: siteContent.manifest.name,
            sameAs: siteContent.socialLinks.map((profile) => profile.url),
            url: siteOrigin,
        },
        {
            '@id': `${siteOrigin}/#website`,
            '@type': 'WebSite',
            alternateName: SITE_NAME,
            name: siteContent.manifest.name,
            publisher: { '@id': personId },
            url: siteOrigin,
        },
    ],
};

export default function AppLayout({ children }: LayoutProps<'/'>) {
    return (
        <>
            <script
                dangerouslySetInnerHTML={{
                    __html: serializeJsonLd(identityJsonLd),
                }}
                type="application/ld+json"
            />
            <a className="skip-link" href={`#${MAIN_CONTENT_ID}`}>
                Skip to content
            </a>
            <NavigationBlockerProvider>{children}</NavigationBlockerProvider>
            <ScrollToTop />
        </>
    );
}
