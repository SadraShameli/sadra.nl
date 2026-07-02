import { describe, expect, it } from 'vitest';

import { mulberry32 } from '~/lib/prop-calculator/rng';

describe('mulberry32', () => {
    it('produces values in [0, 1)', () => {
        const rng = mulberry32(123);
        for (let index = 0; index < 1000; index++) {
            const v = rng();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    it('is deterministic for the same seed', () => {
        const a = mulberry32(42);
        const b = mulberry32(42);
        for (let index = 0; index < 100; index++) {
            expect(a()).toBe(b());
        }
    });

    it('produces different sequences for different seeds', () => {
        const a = mulberry32(1);
        const b = mulberry32(2);
        let diffs = 0;
        for (let index = 0; index < 100; index++) {
            if (a() !== b()) diffs += 1;
        }
        expect(diffs).toBeGreaterThan(90);
    });

    it('handles seed=0', () => {
        const rng = mulberry32(0);
        const v = rng();
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
    });
});
