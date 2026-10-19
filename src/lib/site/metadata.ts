import { type Metadata, type Route } from 'next';

import { BRAND_CARD_ALT, BRAND_CARD_SIZE } from './brandImage';
import { siteContent } from './content';

interface PublicPageMetadataProperties {
    readonly absoluteTitle?: boolean;
    readonly canonical: Route;
    readonly description: string;
    readonly profile?: boolean;
    readonly title: string;
}

export function buildPublicPageMetadata({
    absoluteTitle = false,
    canonical,
    description,
    profile = false,
    title,
}: PublicPageMetadataProperties): Metadata {
    const shareTitle = absoluteTitle
        ? title
        : `${title} · ${siteContent.metaTitle}`;
    const image = {
        ...BRAND_CARD_SIZE,
        alt: BRAND_CARD_ALT,
        url: '/opengraph-image',
    };

    return {
        alternates: { canonical },
        description,
        openGraph: {
            description,
            images: [image],
            siteName: siteContent.manifest.name,
            title: shareTitle,
            type: profile ? 'profile' : 'website',
            url: canonical,
        },
        title: absoluteTitle ? { absolute: title } : title,
        twitter: {
            card: 'summary_large_image',
            description,
            images: [image],
            title: shareTitle,
        },
    };
}
