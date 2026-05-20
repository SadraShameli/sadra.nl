import { describe, expect, it } from 'vitest';

import { checkRateLimit, resetRateLimit } from './rate-limit';

describe('checkRateLimit', () => {
    it('permits requests under the limit and blocks once exceeded', async () => {
        const args = {
            bucket: `t-${Date.now()}-a`,
            key: 'k',
            max: 3,
            windowMs: 60_000,
        };
        expect(await checkRateLimit(args)).toBe(true);
        expect(await checkRateLimit(args)).toBe(true);
        expect(await checkRateLimit(args)).toBe(true);
        expect(await checkRateLimit(args)).toBe(false);
    });

    it('resetRateLimit clears the bucket', async () => {
        const args = {
            bucket: `t-${Date.now()}-b`,
            key: 'k',
            max: 1,
            windowMs: 60_000,
        };
        expect(await checkRateLimit(args)).toBe(true);
        expect(await checkRateLimit(args)).toBe(false);
        resetRateLimit({ bucket: args.bucket, key: args.key });
        expect(await checkRateLimit(args)).toBe(true);
    });

    it('treats keys case-insensitively', async () => {
        const bucket = `t-${Date.now()}-c`;
        const lower = { bucket, key: 'alice', max: 1, windowMs: 60_000 };
        const upper = { bucket, key: 'ALICE', max: 1, windowMs: 60_000 };
        expect(await checkRateLimit(lower)).toBe(true);
        expect(await checkRateLimit(upper)).toBe(false);
    });
});
