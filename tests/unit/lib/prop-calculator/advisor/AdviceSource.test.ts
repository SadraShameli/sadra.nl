import { describe, expect, it } from 'vitest';

import { AdviceSource } from '~/lib/prop-calculator/advisor/AdviceSource';

describe('AdviceSource (F-124, PD-42 type declaration)', () => {
    it('declares every source PT-19 emits, each at most 32 characters', () => {
        expect(new Set(Object.values(AdviceSource))).toEqual(
            new Set([
                'documented',
                'dp-at-state',
                'funded-sweep-fresh',
                'funded-sweep-from-state',
                'ladder-search-fresh',
                'ladder-search-from-state',
                'ledger-recorded-ladder',
                'next-payout-projection',
                'payout-size-sweep',
            ]),
        );
        for (const value of Object.values(AdviceSource)) {
            expect(value.length).toBeLessThanOrEqual(32);
        }
    });
});
