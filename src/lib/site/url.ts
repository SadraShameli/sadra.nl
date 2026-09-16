export function getPublicSiteOrigin(): string {
    const rawServerUrl = process.env.NEXT_PUBLIC_SERVER_URL;
    const explicit = rawServerUrl?.trim();
    if (explicit) {
        return explicit.replace(/\/$/, '');
    }
    return process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : `http://localhost:${process.env.PORT ?? 3000}`;
}
