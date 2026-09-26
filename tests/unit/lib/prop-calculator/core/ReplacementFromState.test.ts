import { describe, expect, it } from 'vitest';

import {
    type AttemptDaySamples,
    type CurrentAttemptInputs,
    dollars,
    type FeeSchedule,
    percent,
    replacementEconomics,
    replacementEconomicsFromState,
    type ReplacementFromStateInputs,
    type ReplacementInputs,
} from '~/lib/prop-calculator/core';

const FEES: FeeSchedule = {
    activation: dollars(50),
    monthlySubscription: dollars(0),
    oneTimeEval: dollars(100),
    reset: dollars(40),
};

const RENEWAL_FEES: FeeSchedule = { ...FEES, monthlySubscription: dollars(30) };

const REBUY_FEES: FeeSchedule = {
    activation: dollars(0),
    monthlySubscription: dollars(100),
    oneTimeEval: dollars(30),
    reset: dollars(1000),
};

const PERIOD = 21;

function current(
    overrides: Partial<CurrentAttemptInputs>,
): CurrentAttemptInputs {
    return {
        meanDaysOnFail: 4,
        meanDaysOnPass: 3,
        passRate: 0.5,
        subscriptionElapsedDays: 5,
        ...overrides,
    };
}

function fresh(overrides: Partial<ReplacementInputs>): ReplacementInputs {
    return {
        discounts: undefined,
        evalPassRate: 0.25,
        fees: FEES,
        meanDaysOnFail: 5,
        meanDaysOnPass: 10,
        ...overrides,
    };
}

function fromState(
    currentOverrides: Partial<CurrentAttemptInputs>,
    freshOverrides: Partial<ReplacementInputs>,
): ReplacementFromStateInputs {
    return { current: current(currentOverrides), fresh: fresh(freshOverrides) };
}

describe('replacementEconomicsFromState on a plan with no subscription', () => {
    it('charges the activation once and (1 - pc) x the retry fee / P, never the sunk initial eval fee', () => {
        const result = replacementEconomicsFromState(fromState({}, {}));
        expect(result.costPerFundedAccount).toBeCloseTo(
            50 + 0.5 * (40 / 0.25),
            9,
        );
        expect(result.daysPerFundedAccount).toBeCloseTo(
            0.5 * 3 + 0.5 * (4 + (10 + 3 * 5)),
            12,
        );
        expect(result.attemptsPerFundedAccount).toBeCloseTo(1 + 0.5 / 0.25, 12);
    });

    it('needs no retries at pc = 1 and bills only the activation, even when a fresh attempt never passes', () => {
        const result = replacementEconomicsFromState(
            fromState({ passRate: 1 }, { evalPassRate: 0 }),
        );
        expect(result).toStrictEqual({
            attemptsPerFundedAccount: 1,
            costPerFundedAccount: 50,
            daysPerFundedAccount: 3,
        });
    });

    it('is infinite across the board when the current attempt can fail and a fresh attempt never passes', () => {
        const result = replacementEconomicsFromState(
            fromState({ passRate: 0.9 }, { evalPassRate: 0 }),
        );
        expect(result).toStrictEqual({
            attemptsPerFundedAccount: Infinity,
            costPerFundedAccount: Infinity,
            daysPerFundedAccount: Infinity,
        });
    });

    it('prices a hopeless current attempt as its remaining days plus a full fresh chain of retries', () => {
        const result = replacementEconomicsFromState(
            fromState(
                {
                    attemptDays: { failDays: [2], passDays: [] },
                    passRate: 0,
                },
                {},
            ),
        );
        expect(result.costPerFundedAccount).toBeCloseTo(50 + 40 / 0.25, 9);
        expect(result.daysPerFundedAccount).toBeCloseTo(4 + 25, 12);
        expect(result.attemptsPerFundedAccount).toBeCloseTo(5, 12);
    });
});

describe('replacementEconomicsFromState on a renewal chain (a reset keeps the same subscription running)', () => {
    it('continues the chain across the reset with its residue offset by elapsed plus current-fail days: 15 elapsed + 4 + a 10-day fresh pass crosses into month 2', () => {
        const result = replacementEconomicsFromState(
            fromState(
                {
                    attemptDays: { failDays: [4], passDays: [3] },
                    subscriptionElapsedDays: 15,
                },
                {
                    attemptDays: { failDays: [], passDays: [10] },
                    evalPassRate: 1,
                    fees: RENEWAL_FEES,
                },
            ),
        );
        expect(result.costPerFundedAccount).toBeCloseTo(
            50 + 0.5 * 40 + 30 * 0.5,
            9,
        );
        expect(result.daysPerFundedAccount).toBeCloseTo(
            0.5 * 3 + 0.5 * (4 + 10),
            12,
        );
    });

    it('matches a brute-force expectation over spread current and fresh samples with a monthly coupon', () => {
        const currentDays = { failDays: [3, 6], passDays: [2, 5] };
        const freshDays = {
            failDays: [1, 4, 20, 33],
            passDays: [6, 19, 22, 40],
        };
        const result = replacementEconomicsFromState({
            current: current({
                attemptDays: currentDays,
                passRate: 0.4,
                subscriptionElapsedDays: 15,
            }),
            fresh: fresh({
                attemptDays: freshDays,
                discounts: {
                    activationPercent: percent(0),
                    evalPercent: percent(0),
                    monthlySubscriptionPercent: percent(50),
                },
                evalPassRate: 0.3,
                fees: { ...FEES, monthlySubscription: dollars(80) },
            }),
        });
        const futureMonths = bruteForceFutureMonths(
            15,
            0.4,
            currentDays,
            0.3,
            freshDays,
        );
        expect(result.costPerFundedAccount).toBeCloseTo(
            50 + 0.6 * (40 / 0.3) + 40 * futureMonths,
            9,
        );
    });

    it('treats the started month as sunk: 20 elapsed + 1 day stays in month 1, 21 elapsed + 1 day opens month 2', () => {
        expect(billedAfterOneMoreDay(0)).toBeCloseTo(50, 12);
        expect(billedAfterOneMoreDay(20)).toBeCloseTo(50, 12);
        expect(billedAfterOneMoreDay(21)).toBeCloseTo(50 + 30, 12);
    });

    it('bills whole months on the expected chain end from mean days when no samples are given, like replacementEconomics', () => {
        const result = replacementEconomicsFromState(
            fromState(
                { subscriptionElapsedDays: 15 },
                { evalPassRate: 1, fees: RENEWAL_FEES },
            ),
        );
        expect(result.costPerFundedAccount).toBeCloseTo(50 + 0.5 * 40 + 30, 9);
    });

    it('from a fresh start with pc = P and the same samples, costs the fresh cost minus the sunk initial eval fee and first month', () => {
        const attemptDays = {
            failDays: [1, 4, 20, 33],
            passDays: [6, 19, 22, 40],
        };
        const freshInputs = fresh({
            attemptDays,
            evalPassRate: 0.3,
            fees: RENEWAL_FEES,
        });
        const result = replacementEconomicsFromState({
            current: current({
                attemptDays,
                meanDaysOnFail: 14.5,
                meanDaysOnPass: 21.75,
                passRate: 0.3,
                subscriptionElapsedDays: 0,
            }),
            fresh: freshInputs,
        });
        expect(result.costPerFundedAccount).toBeCloseTo(
            replacementEconomics(freshInputs).costPerFundedAccount - 100 - 30,
            9,
        );
    });
});

describe('replacementEconomicsFromState on a plan that retries by re-buying (N-60)', () => {
    it('bills the current account past its started months, then each re-bought account from its own first month', () => {
        const result = replacementEconomicsFromState(
            fromState(
                {
                    attemptDays: { failDays: [10], passDays: [3] },
                    meanDaysOnFail: 10,
                    meanDaysOnPass: 3,
                    subscriptionElapsedDays: 15,
                },
                {
                    attemptDays: { failDays: [15], passDays: [25] },
                    evalPassRate: 0.5,
                    fees: REBUY_FEES,
                    meanDaysOnFail: 15,
                    meanDaysOnPass: 25,
                },
            ),
        );
        expect(result.costPerFundedAccount).toBeCloseTo(
            0.5 * (100 + 2 * (30 + 100) + 100),
            9,
        );
        expect(result.daysPerFundedAccount).toBeCloseTo(
            0.5 * 3 + 0.5 * (10 + 25 + 15),
            12,
        );
        expect(result.attemptsPerFundedAccount).toBeCloseTo(2, 12);
    });

    it('prices the same from mean days when no samples are given', () => {
        const result = replacementEconomicsFromState(
            fromState(
                {
                    meanDaysOnFail: 10,
                    meanDaysOnPass: 3,
                    subscriptionElapsedDays: 15,
                },
                {
                    evalPassRate: 0.5,
                    fees: REBUY_FEES,
                    meanDaysOnFail: 15,
                    meanDaysOnPass: 25,
                },
            ),
        );
        expect(result.costPerFundedAccount).toBeCloseTo(230, 9);
    });

    it('from a fresh start with pc = P and the same samples, costs the fresh cost minus the sunk initial eval fee and first month', () => {
        const attemptDays = {
            failDays: [1, 4, 20, 33],
            passDays: [6, 19, 22, 40],
        };
        const freshInputs = fresh({
            attemptDays,
            evalPassRate: 0.3,
            fees: REBUY_FEES,
        });
        const result = replacementEconomicsFromState({
            current: current({
                attemptDays,
                meanDaysOnFail: 14.5,
                meanDaysOnPass: 21.75,
                passRate: 0.3,
                subscriptionElapsedDays: 0,
            }),
            fresh: freshInputs,
        });
        expect(result.costPerFundedAccount).toBeCloseTo(
            replacementEconomics(freshInputs).costPerFundedAccount - 30 - 100,
            9,
        );
    });
});

describe('replacementEconomicsFromState refuses invalid inputs', () => {
    it.each([1.2, -0.1, NaN, Infinity])(
        'throws on a current pass rate of %s',
        (passRate) => {
            expect(() =>
                replacementEconomicsFromState(fromState({ passRate }, {})),
            ).toThrow(/passRate/);
        },
    );

    it.each([1.2, -0.1, NaN, Infinity])(
        'throws on a fresh eval pass rate of %s',
        (evalPassRate) => {
            expect(() =>
                replacementEconomicsFromState(fromState({}, { evalPassRate })),
            ).toThrow(/evalPassRate/);
        },
    );

    it.each([-1, 2.5, NaN, Infinity])(
        'throws on subscription elapsed days of %s',
        (subscriptionElapsedDays) => {
            expect(() =>
                replacementEconomicsFromState(
                    fromState({ subscriptionElapsedDays }, {}),
                ),
            ).toThrow(/subscriptionElapsedDays/);
        },
    );

    it.each([
        { failDays: [], passDays: [3] },
        { failDays: [3], passDays: [] },
        { failDays: [-1], passDays: [3] },
        { failDays: [3], passDays: [1.5] },
    ])(
        'throws on unusable current attempt day samples %o',
        (attemptDays: AttemptDaySamples) => {
            expect(() =>
                replacementEconomicsFromState(
                    fromState({ attemptDays, passRate: 0.5 }, {}),
                ),
            ).toThrow(/attemptDays/);
        },
    );
});

function billedAfterOneMoreDay(elapsedDays: number): number {
    return replacementEconomicsFromState(
        fromState(
            {
                attemptDays: { failDays: [], passDays: [1] },
                passRate: 1,
                subscriptionElapsedDays: elapsedDays,
            },
            { fees: RENEWAL_FEES },
        ),
    ).costPerFundedAccount;
}

function bruteForceFutureMonths(
    elapsedDays: number,
    currentPassRate: number,
    currentDays: AttemptDaySamples,
    freshPassRate: number,
    freshDays: AttemptDaySamples,
): number {
    let expected = 0;
    for (const [days, probability] of pmf(currentDays.passDays)) {
        expected += currentPassRate * probability * months(elapsedDays + days);
    }
    let chain = new Map<number, number>();
    for (const [days, probability] of pmf(currentDays.failDays)) {
        chain.set(elapsedDays + days, probability);
    }
    const freshPass = pmf(freshDays.passDays);
    const freshFail = pmf(freshDays.failDays);
    for (let failures = 0; failures < 160; failures++) {
        const weight =
            (1 - currentPassRate) *
            freshPassRate *
            (1 - freshPassRate) ** failures;
        for (const [days, probability] of chain) {
            for (const [passDays, passProbability] of freshPass) {
                expected +=
                    weight *
                    probability *
                    passProbability *
                    months(days + passDays);
            }
        }
        const next = new Map<number, number>();
        for (const [days, probability] of chain) {
            for (const [extra, extraProbability] of freshFail) {
                next.set(
                    days + extra,
                    (next.get(days + extra) ?? 0) +
                        probability * extraProbability,
                );
            }
        }
        chain = next;
    }
    return expected - months(elapsedDays);
}

function months(days: number): number {
    return Math.max(1, Math.ceil(days / PERIOD));
}

function pmf(days: readonly number[]): Map<number, number> {
    const out = new Map<number, number>();
    for (const day of days) {
        out.set(day, (out.get(day) ?? 0) + 1 / days.length);
    }
    return out;
}
