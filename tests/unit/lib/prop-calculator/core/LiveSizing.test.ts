import { describe, expect, it } from 'vitest';

import { fraction, resolveLiveTradeRisk } from '~/lib/prop-calculator/core';

describe('resolveLiveTradeRisk', () => {
    it('risks zero once the cushion is exactly exhausted', () => {
        expect(resolveLiveTradeRisk(0, fraction(0.05))).toBe(0);
    });

    it('never risks a positive amount when underwater (cushion negative)', () => {
        expect(resolveLiveTradeRisk(-500, fraction(0.05))).toBe(0);
    });

    it("sizes to Apex's confirmed 5% pre-lock rate: $3,000 cushion -> $150 risk", () => {
        expect(resolveLiveTradeRisk(3000, fraction(0.05))).toBeCloseTo(150, 10);
    });

    it("sizes to Apex's confirmed 10% post-lock rate: the same $3,000 cushion doubles to $300 risk once locked", () => {
        const preLockRisk = resolveLiveTradeRisk(3000, fraction(0.05));
        const postLockRisk = resolveLiveTradeRisk(3000, fraction(0.1));

        expect(postLockRisk).toBeCloseTo(300, 10);
        expect(postLockRisk).toBeCloseTo(preLockRisk * 2, 10);
    });

    it('scales linearly with the cushion for a fixed percentage', () => {
        const small = resolveLiveTradeRisk(1000, fraction(0.05));
        const large = resolveLiveTradeRisk(2000, fraction(0.05));

        expect(large).toBeCloseTo(small * 2, 10);
    });
});
