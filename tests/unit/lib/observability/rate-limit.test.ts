import { describe, expect, it } from 'vitest';

import {
    evaluateRateLimit,
    type RateLimitState,
} from '~/lib/observability/rate-limit-policy';

describe('evaluateRateLimit', () => {
    it('permits requests under the limit and blocks once exceeded', () => {
        const now = new Date('2026-01-01T00:00:00Z');
        const windowMs = 60_000;
        const max = 3;
        let state: null | RateLimitState = null;

        for (let index = 0; index < max; index++) {
            const { allowed, next } = evaluateRateLimit(
                state,
                now,
                max,
                windowMs,
            );
            expect(allowed).toBe(true);
            state = next;
        }

        expect(evaluateRateLimit(state, now, max, windowMs).allowed).toBe(
            false,
        );
    });

    it('resets the count once the window has passed', () => {
        const windowMs = 60_000;
        const start = new Date('2026-01-01T00:00:00Z');
        const expired: RateLimitState = {
            count: 5,
            resetAt: new Date(start.getTime() - 1),
        };

        const { allowed, next } = evaluateRateLimit(
            expired,
            start,
            1,
            windowMs,
        );

        expect(allowed).toBe(true);
        expect(next).toEqual({
            count: 1,
            resetAt: new Date(start.getTime() + windowMs),
        });
    });

    it('starts a fresh window when no prior state exists', () => {
        const now = new Date('2026-01-01T00:00:00Z');
        const { allowed, next } = evaluateRateLimit(null, now, 5, 30_000);

        expect(allowed).toBe(true);
        expect(next).toEqual({
            count: 1,
            resetAt: new Date(now.getTime() + 30_000),
        });
    });

    it('does not advance the count once blocked', () => {
        const now = new Date('2026-01-01T00:00:00Z');
        const atLimit: RateLimitState = {
            count: 2,
            resetAt: new Date(now.getTime() + 60_000),
        };

        const { allowed, next } = evaluateRateLimit(atLimit, now, 2, 60_000);

        expect(allowed).toBe(false);
        expect(next).toEqual(atLimit);
    });
});
