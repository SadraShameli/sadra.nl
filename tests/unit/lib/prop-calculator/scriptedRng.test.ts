import { describe, expect, it } from 'vitest';

import { scriptedRng } from './scriptedRng';

describe('scriptedRng (shared test helper, WP21b)', () => {
    it('replays the draws in order, then returns the fallback when one is given', () => {
        const rng = scriptedRng([0.1, 0.9], 0.5);
        expect([rng(), rng(), rng(), rng()]).toStrictEqual([
            0.1, 0.9, 0.5, 0.5,
        ]);
    });

    it('throws once the script is exhausted when no fallback is given', () => {
        const rng = scriptedRng([0.25]);
        expect(rng()).toBe(0.25);
        expect(() => rng()).toThrow('scripted rng exhausted');
    });
});
