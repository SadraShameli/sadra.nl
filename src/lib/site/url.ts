export function getPublicSiteOrigin(): string {
    const explicit = process.env.NEXT_PUBLIC_SERVER_URL?.trim();
    if (explicit) {
        return explicit.replace(/\/$/, '');
    }
    if (process.env.VERCEL_URL) {
        return `https://${process.env.VERCEL_URL}`;
    }
    return `http://localhost:${process.env.PORT ?? 3000}`;
}
