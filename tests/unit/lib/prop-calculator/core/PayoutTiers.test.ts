import { describe, expect, it } from 'vitest';

import {
    dollars,
    FirmId,
    fraction,
    MffuVariant,
    walkPayoutTiers,
} from '~/lib/prop-calculator/core';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';

describe('walkPayoutTiers', () => {
    it('returns 0 for zero or negative profit', () => {
        expect(
            walkPayoutTiers(
                [{ thresholdProfit: dollars(0), traderShare: fraction(0.8) }],
                0,
            ),
        ).toBe(0);
        expect(
            walkPayoutTiers(
                [{ thresholdProfit: dollars(0), traderShare: fraction(0.8) }],
                -100,
            ),
        ).toBe(0);
    });

    it('taxes the full profit at the single tier rate when the only tier starts at $0', () => {
        const tiers = [
            { thresholdProfit: dollars(0), traderShare: fraction(0.8) },
        ];
        expect(walkPayoutTiers(tiers, 5000)).toBe(4000);
    });

    it('spans multiple brackets correctly when every tier starts at $0-anchored thresholds', () => {
        const tiers = [
            { thresholdProfit: dollars(0), traderShare: fraction(0.8) },
            { thresholdProfit: dollars(10_000), traderShare: fraction(0.9) },
        ];
        expect(walkPayoutTiers(tiers, 15_000)).toBe(12_500);
        expect(walkPayoutTiers(tiers, 7000)).toBe(5600);
    });

    it('marginally taxes only the profit actually inside each bracket when the first tier does not start at $0', () => {
        const tiers = [
            { thresholdProfit: dollars(1000), traderShare: fraction(0.5) },
            { thresholdProfit: dollars(2000), traderShare: fraction(0.6) },
        ];
        expect(walkPayoutTiers(tiers, 1500)).toBe(250);
        expect(walkPayoutTiers(tiers, 2500)).toBe(800);
    });

    it('pays nothing when profit does not reach the lowest tier', () => {
        const tiers = [
            { thresholdProfit: dollars(1000), traderShare: fraction(0.5) },
        ];
        expect(walkPayoutTiers(tiers, 1000)).toBe(0);
        expect(walkPayoutTiers(tiers, 999)).toBe(0);
    });
});

function rapidEod() {
    const firm = new MyFundedFutures();
    const plan = firm.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFFU Rapid EOD plan not found');
    return plan;
}

describe('Plan construction rejects duplicate payoutTiers thresholds', () => {
    it('throws when two payoutTiers entries share the same thresholdProfit, since the payout would otherwise silently depend on array order', () => {
        expect(() =>
            rapidEod().withOverrides({
                payoutTiers: [
                    { thresholdProfit: dollars(0), traderShare: fraction(0.5) },
                    { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
                ],
            }),
        ).toThrow(/payoutTiers/);
    });

    it('accepts distinct thresholds without throwing', () => {
        expect(() =>
            rapidEod().withOverrides({
                payoutTiers: [
                    { thresholdProfit: dollars(0), traderShare: fraction(0.5) },
                    {
                        thresholdProfit: dollars(1000),
                        traderShare: fraction(0.9),
                    },
                ],
            }),
        ).not.toThrow();
    });
});
