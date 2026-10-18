import { describe, expect, it } from 'vitest';

import {
    dollars,
    FirmId,
    fraction,
    MffuVariant,
    PayoutCountTieredPayoutSplit,
    scalePayoutTiers,
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

function flat(share: number) {
    return [{ thresholdProfit: dollars(0), traderShare: fraction(share) }];
}

describe('PayoutCountTieredPayoutSplit', () => {
    const schedule = [
        { fromPayoutIndex: 0, tiers: flat(0.7) },
        { fromPayoutIndex: 2, tiers: flat(0.8) },
        { fromPayoutIndex: 4, tiers: flat(0.9) },
    ];

    it('resolves 70/70/80/80/90/90/90 for payout indices 0 to 6', () => {
        const split = new PayoutCountTieredPayoutSplit(schedule);
        expect(
            [0, 1, 2, 3, 4, 5, 6].map(
                (index) => split.tiersFor(index)[0]?.traderShare,
            ),
        ).toStrictEqual([0.7, 0.7, 0.8, 0.8, 0.9, 0.9, 0.9]);
    });

    it('does not depend on construction order', () => {
        const split = new PayoutCountTieredPayoutSplit(schedule.toReversed());
        expect(split.tiersFor(3)[0]?.traderShare).toBe(0.8);
        expect(
            split.schedule.map((entry) => entry.fromPayoutIndex),
        ).toStrictEqual([0, 2, 4]);
    });

    it('becomes stationary at the last scheduled payout index', () => {
        expect(
            new PayoutCountTieredPayoutSplit(schedule)
                .stationaryFromPayoutIndex,
        ).toBe(4);
        expect(
            new PayoutCountTieredPayoutSplit([
                { fromPayoutIndex: 0, tiers: flat(0.9) },
            ]).stationaryFromPayoutIndex,
        ).toBe(0);
    });

    it('rejects an empty schedule, a missing index 0, a duplicate index and a non-integer or negative index', () => {
        expect(() => new PayoutCountTieredPayoutSplit([])).toThrow(
            'PayoutCountTieredPayoutSplit: tiers must not be empty',
        );
        expect(
            () =>
                new PayoutCountTieredPayoutSplit([
                    { fromPayoutIndex: 1, tiers: flat(0.9) },
                ]),
        ).toThrow(
            'PayoutCountTieredPayoutSplit: the first tier must start at fromPayoutIndex 0',
        );
        expect(
            () =>
                new PayoutCountTieredPayoutSplit([
                    { fromPayoutIndex: 0, tiers: flat(0.9) },
                    { fromPayoutIndex: 0, tiers: flat(0.8) },
                ]),
        ).toThrow('PayoutCountTieredPayoutSplit: duplicate fromPayoutIndex 0');
        for (const index of [-1, 1.5]) {
            expect(
                () =>
                    new PayoutCountTieredPayoutSplit([
                        { fromPayoutIndex: 0, tiers: flat(0.9) },
                        { fromPayoutIndex: index, tiers: flat(0.8) },
                    ]),
            ).toThrow(
                `PayoutCountTieredPayoutSplit: fromPayoutIndex must be a non-negative integer, got ${index}`,
            );
        }
    });
});

describe('scalePayoutTiers', () => {
    it('scales every trader share by the factor', () => {
        const scaled = scalePayoutTiers(
            [
                { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
                { thresholdProfit: dollars(5000), traderShare: fraction(1) },
            ],
            0.8,
        );
        expect(scaled[0]?.traderShare).toBeCloseTo(0.72, 10);
        expect(scaled[1]?.traderShare).toBeCloseTo(0.8, 10);
        expect(scaled[1]?.thresholdProfit).toBe(5000);
    });
});
