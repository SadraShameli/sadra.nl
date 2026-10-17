import { describe, expect, it } from 'vitest';

import { sentryBaseOptions } from '~/lib/observability/SentryOptions';

describe('sentryBaseOptions', () => {
    it('tags a Vercel preview build as preview, not production', () => {
        expect(
            sentryBaseOptions({
                nodeEnvironment: 'production',
                vercelEnvironment: 'preview',
            }).environment,
        ).toBe('preview');
    });

    it('samples a tenth of production traces and every local one', () => {
        expect(
            sentryBaseOptions({
                nodeEnvironment: 'production',
                vercelEnvironment: 'production',
            }).tracesSampleRate,
        ).toBe(0.1);
        expect(
            sentryBaseOptions({
                nodeEnvironment: 'development',
                vercelEnvironment: undefined,
            }),
        ).toEqual({ environment: 'development', tracesSampleRate: 1 });
    });
});
