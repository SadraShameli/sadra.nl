import { describe, expect, it } from 'vitest';

import { fraction } from '~/lib/prop-calculator/core';
import {
    compoundedMultiple,
    ECONOMICS_DISCLOSURE_TEXT,
    EconomicsDisclosure,
    EconomicsReason,
    expectancyPerTradeR,
    fullKellyFraction,
    kellyGrowthPerTrade,
} from '~/lib/prop-calculator/economics';

describe('expectancyPerTradeR', () => {
    it.each([
        [0.4, 2, 0.2],
        [0.7, 1, 0.4],
        [0.52, 1, 0.04],
    ])('is p x rr - (1 - p) at %f and 1:%f', (winrate, rr, expected) => {
        const result = expectancyPerTradeR(fraction(winrate), rr);
        expect(result.reason).toBeNull();
        expect(result.value).toBeCloseTo(expected, 12);
    });

    it('is negative without an edge', () => {
        expect(expectancyPerTradeR(fraction(0.3), 1).value).toBeCloseTo(
            -0.4,
            12,
        );
    });

    it.each([
        [NaN, 1],
        [-0.1, 1],
        [1.1, 1],
        [0.5, 0],
        [0.5, -1],
        [0.5, Infinity],
    ])('is undefined with InvalidInput at winrate %f and rr %f', (w, rr) => {
        const result = expectancyPerTradeR(fraction(w), rr);
        expect(result.value).toBeNull();
        expect(result.reason).toBe(EconomicsReason.InvalidInput);
    });
});

describe('fullKellyFraction', () => {
    it.each([
        [0.7, 1, 0.4],
        [0.4, 2, 0.1],
        [0.5, 2, 0.25],
    ])('is (p(rr+1) - 1)/rr at %f and 1:%f', (winrate, rr, expected) => {
        expect(fullKellyFraction(fraction(winrate), rr).value).toBeCloseTo(
            expected,
            12,
        );
    });

    it('stays negative without an edge so callers can tell no edge from n/a', () => {
        expect(fullKellyFraction(fraction(0.4), 1).value).toBeCloseTo(-0.2, 12);
    });

    it('is exactly zero at break-even', () => {
        expect(fullKellyFraction(fraction(0.5), 1).value).toBe(0);
    });

    it('says Kelly is a growth optimum for an irreplaceable bankroll, not the prop sizing rule', () => {
        expect(fullKellyFraction(fraction(0.4), 2).disclosures).toEqual([
            EconomicsDisclosure.KellyNotPropSizing,
        ]);
        expect(kellyGrowthPerTrade(fraction(0.7), 1).disclosures).toEqual([
            EconomicsDisclosure.KellyNotPropSizing,
        ]);
        expect(
            ECONOMICS_DISCLOSURE_TEXT[EconomicsDisclosure.KellyNotPropSizing],
        ).toBe(
            'growth optimum for an irreplaceable bankroll; not the prop eval or funded sizing rule',
        );
    });

    it('is undefined for a non-positive reward ratio', () => {
        const result = fullKellyFraction(fraction(0.9), 0);
        expect(result.value).toBeNull();
        expect(result.reason).toBe(EconomicsReason.InvalidInput);
    });
});

describe('kellyGrowthPerTrade', () => {
    it('is the expected log growth at full Kelly: 70% at 1:1 gives 0.082283', () => {
        expect(kellyGrowthPerTrade(fraction(0.7), 1).value).toBeCloseTo(
            0.082283,
            6,
        );
    });

    it('is ln(1 + rr) when every trade wins', () => {
        expect(kellyGrowthPerTrade(fraction(1), 2).value).toBeCloseTo(
            Math.log(3),
            12,
        );
    });

    it('is undefined with NoPositiveEdge at or below break-even', () => {
        for (const winrate of [0.5, 0.3, 0]) {
            const result = kellyGrowthPerTrade(fraction(winrate), 1);
            expect(result.value).toBeNull();
            expect(result.reason).toBe(EconomicsReason.NoPositiveEdge);
        }
    });

    it('is undefined with InvalidInput for a winrate outside 0 to 1', () => {
        expect(kellyGrowthPerTrade(fraction(1.2), 1).reason).toBe(
            EconomicsReason.InvalidInput,
        );
    });
});

describe('compoundedMultiple', () => {
    it('is exp(trades x growth)', () => {
        const growth = 0.082283;
        expect(compoundedMultiple(growth, 100).value).toBeCloseTo(
            Math.exp(100 * growth),
            9,
        );
    });

    it('is 1 after zero trades', () => {
        expect(compoundedMultiple(0.05, 0).value).toBe(1);
    });

    it('chains Kelly growth into a multiple', () => {
        const growth = kellyGrowthPerTrade(fraction(0.7), 1).value ?? 0;
        expect(compoundedMultiple(growth, 10).value).toBeCloseTo(
            Math.exp(10 * 0.082283),
            5,
        );
    });

    it.each([
        [0.1, -1],
        [0.1, 1.5],
        [NaN, 10],
    ])('is undefined for growth %f over %f trades', (growth, trades) => {
        expect(compoundedMultiple(growth, trades).reason).toBe(
            EconomicsReason.InvalidInput,
        );
    });
});

describe('disclosure text', () => {
    it('states every disclosure in plain words without em dashes', () => {
        for (const disclosure of Object.values(EconomicsDisclosure)) {
            const text = ECONOMICS_DISCLOSURE_TEXT[disclosure];
            expect(text.length).toBeGreaterThan(0);
            expect(text).not.toContain(String.fromCodePoint(0x20_14));
        }
    });

    it('names the approximations with the wording the cards show', () => {
        expect(
            ECONOMICS_DISCLOSURE_TEXT[
                EconomicsDisclosure.NearFreshEvalApproximation
            ],
        ).toBe('approximation, valid near a fresh eval');
        expect(
            ECONOMICS_DISCLOSURE_TEXT[
                EconomicsDisclosure.RandomWalkApproximation
            ],
        ).toBe(
            'random-walk approximation that ignores the consistency rule, daily loss limit, daily profit cap and contract limits; the simulated pass rate and trades per pass stay authoritative',
        );
        expect(
            ECONOMICS_DISCLOSURE_TEXT[
                EconomicsDisclosure.NoPayoutIgnoresPayoutSize
            ],
        ).toBe('P(no payout from N attempts); ignores payout size');
        expect(
            ECONOMICS_DISCLOSURE_TEXT[
                EconomicsDisclosure.OneValuePerPayingAttempt
            ],
        ).toBe('one value per paying attempt; cross-check only');
        expect(
            ECONOMICS_DISCLOSURE_TEXT[
                EconomicsDisclosure.OnePayoutPerPayingAccount
            ],
        ).toBe('one payout per paying account');
        expect(
            ECONOMICS_DISCLOSURE_TEXT[
                EconomicsDisclosure.DeterministicIllustration
            ],
        ).toBe(
            'not a forecast: all payouts inside the cycle, constant multiple, no caps, no variance',
        );
    });
});
