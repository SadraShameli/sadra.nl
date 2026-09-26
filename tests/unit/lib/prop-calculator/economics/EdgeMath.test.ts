import { describe, expect, it } from 'vitest';

import { dollars, fraction } from '~/lib/prop-calculator/core';
import {
    compoundedMultiple,
    ECONOMICS_DISCLOSURE_TEXT,
    ECONOMICS_REASON_TEXT,
    EconomicsDisclosure,
    EconomicsReason,
    evalPace,
    expectancyPerTradeR,
    fullKellyFraction,
    kellyGrowthPerTrade,
    MAX_WALK_CELLS,
    MAX_WALK_RATIO_DENOMINATOR,
    MAX_WALK_WORK,
} from '~/lib/prop-calculator/economics';

const MAX_ONE_DECIMAL_TENTHS = 100;
const SMALLEST_LAB_RISK = dollars(50);
const LARGEST_LAB_RISK = dollars(500);

const REALISTIC_EVALS = [
    { drawdown: dollars(2000), target: dollars(3000) },
    { drawdown: dollars(4500), target: dollars(9000) },
];

const ONE_R_EVAL = {
    drawdown: dollars(100),
    riskPerTrade: dollars(100),
    rrRatio: 2,
    target: dollars(100),
    winrate: fraction(0.4),
};

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
            'random-walk approximation with a fixed drawdown floor at the starting balance minus the drawdown, so a trailing or end-of-day drawdown is not modelled and the value is optimistic for it; it uses a flat risk per trade with no eval ladder, commissions or contract rounding, and a trade taken with less than one risk of cushion left still wins the full reward, where the simulation by default caps that trade to the remaining cushion, so the value is also optimistic when the drawdown is not a whole multiple of the risk or the reward:risk is not a whole number; it ignores the consistency rule, daily loss limit, daily profit cap, day-stop rule, trades per day and contract limits; the simulated pass rate and trades per pass stay authoritative',
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

    it('says the random walk holds the drawdown floor fixed and leaves out the lab execution settings', () => {
        const text =
            ECONOMICS_DISCLOSURE_TEXT[
                EconomicsDisclosure.RandomWalkApproximation
            ];
        expect(text).toContain('fixed drawdown floor');
        expect(text).toContain(
            'trailing or end-of-day drawdown is not modelled',
        );
        expect(text).toContain('optimistic');
        expect(text).toContain('eval ladder');
        expect(text).toContain('commissions');
        expect(text).toContain('day-stop rule');
        expect(text).toContain('trades per day');
    });

    it('says a trade with less than one risk of cushion left still wins the full reward, so a drawdown off the risk grid is optimistic', () => {
        const text =
            ECONOMICS_DISCLOSURE_TEXT[
                EconomicsDisclosure.RandomWalkApproximation
            ];
        expect(text).toContain(
            'a trade taken with less than one risk of cushion left still wins the full reward',
        );
        expect(text).toContain(
            'the simulation by default caps that trade to the remaining cushion',
        );
        expect(text).toContain(
            'optimistic when the drawdown is not a whole multiple of the risk or the reward:risk is not a whole number',
        );
    });
});

describe('reason text', () => {
    it('states every reason in plain words without em dashes', () => {
        for (const reason of Object.values(EconomicsReason)) {
            const text = ECONOMICS_REASON_TEXT[reason];
            expect(text.length).toBeGreaterThan(0);
            expect(text).not.toContain(String.fromCodePoint(0x20_14));
        }
    });

    it('gives every reason its own text', () => {
        const texts = Object.values(EconomicsReason).map(
            (reason) => ECONOMICS_REASON_TEXT[reason],
        );
        expect(new Set(texts).size).toBe(texts.length);
    });

    it('advises a one-decimal reward:risk, which the walk solves on realistic evals across the lab risk range', () => {
        const text = ECONOMICS_REASON_TEXT[EconomicsReason.UnsupportedRatio];
        expect(text).toContain('one decimal');
        expect(text).toContain('1.3 instead of 1.333');
        expect(evalPace({ ...ONE_R_EVAL, rrRatio: 1.333 }).reason).toBe(
            EconomicsReason.UnsupportedRatio,
        );
        expect(
            evalPace({
                ...ONE_R_EVAL,
                ...REALISTIC_EVALS[0],
                riskPerTrade: SMALLEST_LAB_RISK,
                rrRatio: 1.33,
            }).reason,
        ).toBe(EconomicsReason.WalkGridTooLarge);
        const unsolved = REALISTIC_EVALS.flatMap((plan) =>
            [SMALLEST_LAB_RISK, LARGEST_LAB_RISK].flatMap((riskPerTrade) =>
                Array.from(
                    { length: MAX_ONE_DECIMAL_TENTHS },
                    (_, index) => (index + 1) / 10,
                )
                    .map((rrRatio) => ({
                        reason: evalPace({
                            ...ONE_R_EVAL,
                            ...plan,
                            riskPerTrade,
                            rrRatio,
                        }).reason,
                        riskPerTrade,
                        rrRatio,
                        target: plan.target,
                    }))
                    .filter(({ reason }) => reason !== null),
            ),
        );
        expect(unsolved).toEqual([]);
    });

    it('states the reward:risk denominator limit the walk actually uses', () => {
        const text = ECONOMICS_REASON_TEXT[EconomicsReason.UnsupportedRatio];
        expect(MAX_WALK_RATIO_DENOMINATOR).toBe(100);
        expect(text).toContain(
            `a denominator of at most ${String(MAX_WALK_RATIO_DENOMINATOR)}`,
        );
        expect(text).toContain('at most two decimals');
        expect(evalPace({ ...ONE_R_EVAL, rrRatio: 1.33 }).reason).toBeNull();
        expect(evalPace({ ...ONE_R_EVAL, rrRatio: 1.331 }).reason).toBe(
            EconomicsReason.UnsupportedRatio,
        );
    });

    it('states the work and memory limits the walk actually uses', () => {
        const text = ECONOMICS_REASON_TEXT[EconomicsReason.WalkGridTooLarge];
        const grouped = new Intl.NumberFormat('en-US');
        expect(MAX_WALK_WORK).toBe(100_000_000);
        expect(MAX_WALK_CELLS).toBe(4_000_000);
        expect(text).toContain(`${grouped.format(MAX_WALK_WORK)} solver steps`);
        expect(text).toContain(
            `${grouped.format(MAX_WALK_CELLS)} stored values`,
        );
    });

    it('names too many reward:risk decimals as the cause of a walk grid that is too large, with no advice to change risk', () => {
        const text = ECONOMICS_REASON_TEXT[EconomicsReason.WalkGridTooLarge];
        expect(text).toContain('too many decimals');
        expect(text).toContain('2.4 instead of 2.37');
        expect(text).toContain('the simulated pass rate stays authoritative');
        expect(text).not.toMatch(
            /(larger|raise|increase|higher|bigger|more)\s+risk/i,
        );
        const largeEval = {
            ...ONE_R_EVAL,
            ...REALISTIC_EVALS[1],
            riskPerTrade: dollars(100),
        };
        expect(evalPace({ ...largeEval, rrRatio: 2.37 }).reason).toBe(
            EconomicsReason.WalkGridTooLarge,
        );
        expect(evalPace({ ...largeEval, rrRatio: 2.4 }).reason).toBeNull();
    });
});
