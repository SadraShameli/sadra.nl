import { describe, expect, it } from 'vitest';

import {
    isWithinPayoutTolerance,
    PAYOUT_TOLERANCE_CENTS,
} from '~/lib/prop-accounts/core';

describe('isWithinPayoutTolerance', () => {
    it('is exactly 100 cents', () => {
        expect(PAYOUT_TOLERANCE_CENTS).toBe(100);
    });

    it('is true at exactly the tolerance', () => {
        expect(isWithinPayoutTolerance(100)).toBe(true);
        expect(isWithinPayoutTolerance(-100)).toBe(true);
    });

    it('is false just beyond the tolerance', () => {
        expect(isWithinPayoutTolerance(101)).toBe(false);
        expect(isWithinPayoutTolerance(-101)).toBe(false);
    });

    it('is true at zero difference', () => {
        expect(isWithinPayoutTolerance(0)).toBe(true);
    });
});
