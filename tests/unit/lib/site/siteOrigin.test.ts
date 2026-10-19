import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
});

describe('the configured public site origin', () => {
    it('uses the configured domain for the origin and display name', async () => {
        vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://trader.example/path/');
        vi.resetModules();
        const { getPublicSiteOrigin } = await import('~/lib/site/url');
        const { SITE_NAME } = await import('~/lib/site/siteName');

        expect(getPublicSiteOrigin()).toBe('https://trader.example');
        expect(SITE_NAME).toBe('trader.example');
    });

    it('uses the deployment origin when no explicit URL is configured', async () => {
        vi.stubEnv('NEXT_PUBLIC_SERVER_URL', '');
        vi.stubEnv('VERCEL_URL', 'preview.example');
        const { getPublicSiteOrigin } = await import('~/lib/site/url');

        expect(getPublicSiteOrigin()).toBe('https://preview.example');
    });

    it('preserves the local development port', async () => {
        vi.stubEnv('NEXT_PUBLIC_SERVER_URL', '');
        vi.stubEnv('VERCEL_URL', '');
        vi.stubEnv('PORT', '4100');
        const { getPublicSiteOrigin } = await import('~/lib/site/url');

        expect(getPublicSiteOrigin()).toBe('http://localhost:4100');
    });
});
