import { describe, expect, it, vi } from 'vitest';

async function rewriteSources(): Promise<string[]> {
    vi.stubEnv('SKIP_ENV_VALIDATION', '1');
    const { default: nextConfig } = await import('../../next.config.js');
    const rewrites = await nextConfig.rewrites?.();
    if (rewrites === undefined) return [];
    if (Array.isArray(rewrites)) return rewrites.map((rule) => rule.source);
    return [
        ...(rewrites.beforeFiles ?? []),
        ...(rewrites.afterFiles ?? []),
        ...(rewrites.fallback ?? []),
    ].map((rule) => rule.source);
}

describe('next.config Sentry tunnel', () => {
    it('sends browser Sentry events through a same-origin route', async () => {
        const sources = await rewriteSources();

        expect(sources.some((source) => source.startsWith('/monitoring'))).toBe(
            true,
        );
    });
});
