import { z } from 'zod';

const publicSiteOriginSchema = z.templateLiteral([
    z.enum(['http', 'https']),
    '://',
    z.string(),
]);

export type PublicSiteOrigin = z.infer<typeof publicSiteOriginSchema>;

export function getPublicSiteOrigin(): PublicSiteOrigin {
    const rawServerUrl = process.env.NEXT_PUBLIC_SERVER_URL;
    const explicit = rawServerUrl?.trim();
    const configuredUrl =
        explicit === undefined || explicit === ''
            ? process.env.VERCEL_URL
                ? `https://${process.env.VERCEL_URL}`
                : `http://localhost:${process.env.PORT ?? 3000}`
            : explicit;
    return publicSiteOriginSchema.parse(new URL(configuredUrl).origin);
}
