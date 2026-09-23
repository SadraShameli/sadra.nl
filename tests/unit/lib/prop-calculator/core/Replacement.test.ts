import { describe, expect, it } from 'vitest';

import {
    type FeeSchedule,
    percent,
    replacementEconomics,
    type ReplacementInputs,
} from '~/lib/prop-calculator/core';
import { dollars } from '~/lib/prop-calculator/core/lib/units';

const FEES: FeeSchedule = {
    activation: dollars(50),
    monthlySubscription: dollars(0),
    oneTimeEval: dollars(100),
    reset: dollars(40),
};

function inputs(overrides: Partial<ReplacementInputs>): ReplacementInputs {
    return {
        discounts: undefined,
        evalPassRate: 0.25,
        fees: FEES,
        meanDaysOnFail: 5,
        meanDaysOnPass: 10,
        ...overrides,
    };
}

describe('replacementEconomics (D1: one cost per funded account formula)', () => {
    it('charges the initial eval once, the cheaper retry per failed attempt and the activation once', () => {
        const result = replacementEconomics(inputs({}));
        expect(result.attemptsPerFundedAccount).toBeCloseTo(4, 12);
        expect(result.daysPerFundedAccount).toBeCloseTo(25, 12);
        expect(result.costPerFundedAccount).toBeCloseTo(100 + 3 * 40 + 50, 9);
    });

    it('bills the subscription over the expected days per funded account', () => {
        const result = replacementEconomics(
            inputs({ fees: { ...FEES, monthlySubscription: dollars(30) } }),
        );
        expect(result.costPerFundedAccount).toBeCloseTo(270 + 30 * 2, 9);
    });

    it('bills the expected whole months of the renewal chain from attempt day samples, not whole months on the mean days', () => {
        const attemptDays = { failDays: [15], passDays: [10] };
        const result = replacementEconomics(
            inputs({
                attemptDays,
                evalPassRate: 0.5,
                fees: { ...FEES, monthlySubscription: dollars(30) },
            }),
        );
        const months = bruteForceBilledMonths(0.5, attemptDays);
        expect(months).toBeLessThan(2);
        expect(result.costPerFundedAccount).toBeCloseTo(
            100 + 1 * 40 + 30 * months + 50,
            9,
        );
    });

    it('matches a brute-force expectation over spread day samples and applies the monthly coupon', () => {
        const attemptDays = {
            failDays: [1, 4, 20, 33],
            passDays: [6, 19, 22, 40],
        };
        const result = replacementEconomics(
            inputs({
                attemptDays,
                discounts: {
                    activationPercent: percent(0),
                    evalPercent: percent(0),
                    monthlySubscriptionPercent: percent(50),
                },
                evalPassRate: 0.3,
                fees: { ...FEES, monthlySubscription: dollars(80) },
            }),
        );
        expect(result.costPerFundedAccount).toBeCloseTo(
            100 +
                (1 / 0.3 - 1) * 40 +
                40 * bruteForceBilledMonths(0.3, attemptDays) +
                50,
            9,
        );
    });

    it('bills one month for a chain with no eval days, like an instant funded account', () => {
        const result = replacementEconomics(
            inputs({
                attemptDays: { failDays: [], passDays: [0] },
                evalPassRate: 1,
                fees: { ...FEES, monthlySubscription: dollars(30) },
            }),
        );
        expect(result.costPerFundedAccount).toBeCloseTo(100 + 30 + 50, 9);
    });

    it.each([
        { failDays: [3], passDays: [] },
        { failDays: [], passDays: [3] },
        { failDays: [-1], passDays: [3] },
        { failDays: [2.5], passDays: [3] },
        { failDays: [3], passDays: [NaN] },
    ])('throws on unusable attempt day samples %o', (attemptDays) => {
        expect(() =>
            replacementEconomics(inputs({ attemptDays, evalPassRate: 0.5 })),
        ).toThrow(/attemptDays/);
    });

    it('retries with a fresh purchase when the reset costs more than a re-buy, and never multiplies the activation', () => {
        const result = replacementEconomics(
            inputs({ fees: { ...FEES, reset: dollars(150) } }),
        );
        expect(result.costPerFundedAccount).toBeCloseTo(100 / 0.25 + 50, 9);
        expect(result.costPerFundedAccount).not.toBeCloseTo(150 / 0.25, 9);
    });

    it('applies the eval coupon to the initial eval and to the re-buy side of the retry comparison', () => {
        const result = replacementEconomics(
            inputs({
                discounts: {
                    activationPercent: percent(0),
                    evalPercent: percent(50),
                },
            }),
        );
        expect(result.costPerFundedAccount).toBeCloseTo(50 + 3 * 40 + 50, 9);
    });

    it('collapses to eval plus activation at a 100% eval pass rate', () => {
        const result = replacementEconomics(inputs({ evalPassRate: 1 }));
        expect(result.attemptsPerFundedAccount).toBe(1);
        expect(result.costPerFundedAccount).toBeCloseTo(150, 12);
        expect(result.daysPerFundedAccount).toBe(10);
    });

    it('is infinite across the board when no eval attempt ever passes', () => {
        const result = replacementEconomics(inputs({ evalPassRate: 0 }));
        expect(result.attemptsPerFundedAccount).toBe(Infinity);
        expect(result.costPerFundedAccount).toBe(Infinity);
        expect(result.daysPerFundedAccount).toBe(Infinity);
    });

    it.each([1.2, -0.1, NaN, Infinity])(
        'throws on an eval pass rate of %s',
        (evalPassRate) => {
            expect(() =>
                replacementEconomics(inputs({ evalPassRate })),
            ).toThrow(/evalPassRate/);
        },
    );
});

function bruteForceBilledMonths(
    evalPassRate: number,
    samples: { failDays: readonly number[]; passDays: readonly number[] },
): number {
    let chain = pmf(samples.passDays);
    const fail = pmf(samples.failDays);
    let expected = 0;
    for (let failures = 0; failures < 120; failures++) {
        const weight = evalPassRate * (1 - evalPassRate) ** failures;
        for (const [days, probability] of chain) {
            expected +=
                weight * probability * Math.max(1, Math.ceil(days / 21));
        }
        const next = new Map<number, number>();
        for (const [days, probability] of chain) {
            for (const [extra, extraProbability] of fail) {
                next.set(
                    days + extra,
                    (next.get(days + extra) ?? 0) +
                        probability * extraProbability,
                );
            }
        }
        chain = next;
    }
    return expected;
}

function pmf(days: readonly number[]): Map<number, number> {
    const out = new Map<number, number>();
    for (const day of days) {
        out.set(day, (out.get(day) ?? 0) + 1 / days.length);
    }
    return out;
}
