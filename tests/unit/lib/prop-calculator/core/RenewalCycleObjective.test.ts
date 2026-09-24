import { describe, expect, it } from 'vitest';

import {
    dollars,
    fraction,
    MffuVariant,
    percent,
    replacementEconomics,
    RetryKind,
    TopStepVariant,
    TRADING_DAYS_PER_MONTH,
} from '~/lib/prop-calculator/core';
import {
    RenewalCycleObjective,
    type RenewalCycleObjectiveInit,
} from '~/lib/prop-calculator/core/RenewalCycleObjective';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { TopStep } from '~/lib/prop-calculator/firms/topstep/TopStep';

const mffu = new MyFundedFutures();
const topstep = new TopStep();

function monthlySubscriptionPlan() {
    const found = topstep.findPlan({
        accountSize: 50_000,
        firm: topstep.id,
        variant: TopStepVariant.StandardStandard,
    });
    if (!found) throw new Error('TopStep Standard-Standard plan not found');
    return found;
}

function oneTimeFeePlan() {
    const found = mffu.findPlan({
        accountSize: 50_000,
        firm: mffu.id,
        variant: MffuVariant.RapidEod,
    });
    if (!found) throw new Error('MFFU Rapid EOD plan not found');
    return found;
}

const WITH_DISCOUNTS = {
    activationPercent: percent(10),
    evalPercent: percent(15),
    monthlySubscriptionPercent: percent(20),
    resetPercent: percent(0),
};

const CYCLE_DAYS = [1, 20, 21, 22, 42, 43];

function sumEvalDayCost(
    objective: RenewalCycleObjective,
    ratePerDay: number,
    days: number,
): number {
    let total = 0;
    for (let day = 0; day < days; day += 1) {
        total += objective.evalDayCost(ratePerDay, day);
    }
    return total;
}

describe.each([
    ['one-time-fee plan (MFFU Rapid EOD)', oneTimeFeePlan],
    [
        'monthly-subscription plan (TopStep Standard-Standard)',
        monthlySubscriptionPlan,
    ],
] as const)('%s', (_planLabel, planFactory) => {
    describe.each([
        ['without discounts', undefined],
        ['with discounts', WITH_DISCOUNTS],
    ] as const)('%s', (_discountLabel, discounts) => {
        it.each(CYCLE_DAYS)(
            'entryCost(0) plus evalDayCost(0, d) for d < %d telescopes to feesUntilPass on a fail and totalCostThroughDay on a pass',
            (days) => {
                const plan = planFactory();
                const objective = new RenewalCycleObjective({
                    discounts,
                    fundedHorizonDays: 252,
                    maxEvalDays: 60,
                    plan,
                    rebuyLagDays: 0,
                });

                const failTotal =
                    objective.entryCost(0) + sumEvalDayCost(objective, 0, days);
                expect(failTotal).toBeCloseTo(
                    plan.feesUntilPass(days, discounts),
                    6,
                );

                const passTotal = failTotal + objective.activationCost();
                expect(passTotal).toBeCloseTo(
                    plan.totalCostThroughDay(days, discounts),
                    6,
                );
            },
        );
    });
});

describe('costs are linear in ratePerDay and in rebuyLagDays', () => {
    it('entryCost is affine in ratePerDay with slope rebuyLagDays', () => {
        const plan = oneTimeFeePlan();
        const objective = new RenewalCycleObjective({
            fundedHorizonDays: 252,
            maxEvalDays: 60,
            plan,
            rebuyLagDays: 4,
        });
        const base = objective.entryCost(0);
        expect(objective.entryCost(3)).toBeCloseTo(base + 3 * 4, 9);
        expect(objective.entryCost(7)).toBeCloseTo(base + 7 * 4, 9);
    });

    it('evalDayCost and fundedDayCost increase by exactly ratePerDay', () => {
        const plan = oneTimeFeePlan();
        const objective = new RenewalCycleObjective({
            fundedHorizonDays: 252,
            maxEvalDays: 60,
            plan,
            rebuyLagDays: 0,
        });
        const day = 5;
        const base = objective.evalDayCost(0, day);
        expect(objective.evalDayCost(2, day)).toBeCloseTo(base + 2, 9);
        expect(objective.fundedDayCost(9)).toBe(9);
        expect(objective.fundedDayCost(-3)).toBe(-3);
    });

    it('entryCost is linear in rebuyLagDays at a fixed nonzero rate', () => {
        const plan = oneTimeFeePlan();
        const rate = 5;
        const withoutLag = new RenewalCycleObjective({
            fundedHorizonDays: 252,
            maxEvalDays: 60,
            plan,
            rebuyLagDays: 0,
        }).entryCost(rate);
        const withLag5 = new RenewalCycleObjective({
            fundedHorizonDays: 252,
            maxEvalDays: 60,
            plan,
            rebuyLagDays: 5,
        }).entryCost(rate);
        const withLag10 = new RenewalCycleObjective({
            fundedHorizonDays: 252,
            maxEvalDays: 60,
            plan,
            rebuyLagDays: 10,
        }).entryCost(rate);
        expect(withLag5 - withoutLag).toBeCloseTo(rate * 5, 9);
        expect(withLag10 - withoutLag).toBeCloseTo(
            2 * (withLag5 - withoutLag),
            9,
        );
    });
});

describe('cycle-length and rate helpers', () => {
    it('minCycleDays is 1 plus the rebuy lag', () => {
        const plan = oneTimeFeePlan();
        const objective = new RenewalCycleObjective({
            fundedHorizonDays: 252,
            maxEvalDays: 60,
            plan,
            rebuyLagDays: 6,
        });
        expect(objective.minCycleDays()).toBe(7);
    });

    it('maxExpectedCycleDays is evalDayCap(maxEvalDays) + fundedHorizonDays + rebuyLagDays', () => {
        const plan = oneTimeFeePlan();
        const objective = new RenewalCycleObjective({
            fundedHorizonDays: 252,
            maxEvalDays: 60,
            plan,
            rebuyLagDays: 3,
        });
        expect(objective.maxExpectedCycleDays()).toBe(
            plan.evalDayCap(60) + 252 + 3,
        );
    });

    it('monthlyRate scales ratePerDay by TRADING_DAYS_PER_MONTH', () => {
        const plan = oneTimeFeePlan();
        const objective = new RenewalCycleObjective({
            fundedHorizonDays: 252,
            maxEvalDays: 60,
            plan,
            rebuyLagDays: 0,
        });
        expect(objective.monthlyRate(2)).toBe(2 * TRADING_DAYS_PER_MONTH);
    });
});

describe('constructor validation', () => {
    it('throws when fundedHorizonDays < 1', () => {
        const plan = oneTimeFeePlan();
        expect(
            () =>
                new RenewalCycleObjective({
                    fundedHorizonDays: 0,
                    maxEvalDays: 60,
                    plan,
                    rebuyLagDays: 0,
                }),
        ).toThrow();
    });

    it('throws when rebuyLagDays < 0', () => {
        const plan = oneTimeFeePlan();
        expect(
            () =>
                new RenewalCycleObjective({
                    fundedHorizonDays: 252,
                    maxEvalDays: 60,
                    plan,
                    rebuyLagDays: -1,
                }),
        ).toThrow();
    });

    it('throws on a non-finite fundedHorizonDays', () => {
        const plan = oneTimeFeePlan();
        expect(
            () =>
                new RenewalCycleObjective({
                    fundedHorizonDays: NaN,
                    maxEvalDays: 60,
                    plan,
                    rebuyLagDays: 0,
                }),
        ).toThrow();
    });

    it('throws on a non-finite rebuyLagDays', () => {
        const plan = oneTimeFeePlan();
        expect(
            () =>
                new RenewalCycleObjective({
                    fundedHorizonDays: 252,
                    maxEvalDays: 60,
                    plan,
                    rebuyLagDays: Infinity,
                }),
        ).toThrow();
    });
});

function feeToyPlan(fees: {
    activation: number;
    monthlySubscription: number;
    oneTimeEval: number;
    reset: number;
    retry?: RetryKind;
}) {
    return oneTimeFeePlan().withOverrides({
        bulkDiscount: { minAccounts: 5, percent: fraction(0.1) },
        fees: {
            activation: dollars(fees.activation),
            monthlySubscription: dollars(fees.monthlySubscription),
            oneTimeEval: dollars(fees.oneTimeEval),
            reset: dollars(fees.reset),
            retry: fees.retry,
        },
    });
}

function toyObjective(
    plan: ReturnType<typeof feeToyPlan>,
    overrides: Partial<RenewalCycleObjectiveInit> = {},
): RenewalCycleObjective {
    return new RenewalCycleObjective({
        fundedHorizonDays: 252,
        maxEvalDays: 60,
        plan,
        rebuyLagDays: 3,
        ...overrides,
    });
}

describe('retryCost prices a failed eval at the D1 retry fee, not a fresh purchase', () => {
    it('a reset cheaper than the eval: a retry costs the $120 reset while a fresh start costs the $200 eval', () => {
        const objective = toyObjective(
            feeToyPlan({
                activation: 100,
                monthlySubscription: 0,
                oneTimeEval: 200,
                reset: 120,
            }),
        );
        expect(objective.retryCost(0, 7)).toBe(120);
        expect(objective.entryCost(0)).toBe(200);
    });

    it('retryCost carries the same rebuy lag as entryCost, so their gap does not depend on the rate', () => {
        const objective = toyObjective(
            feeToyPlan({
                activation: 100,
                monthlySubscription: 0,
                oneTimeEval: 200,
                reset: 120,
            }),
        );
        expect(objective.retryCost(5, 7)).toBeCloseTo(120 + 5 * 3, 9);
        expect(objective.entryCost(5) - objective.retryCost(5, 7)).toBeCloseTo(
            80,
            9,
        );
        expect(
            objective.entryCost(-2) - objective.retryCost(-2, 7),
        ).toBeCloseTo(80, 9);
    });

    it('a reset dearer than the re-buy retries at the cheaper re-buy price', () => {
        const objective = toyObjective(
            feeToyPlan({
                activation: 0,
                monthlySubscription: 0,
                oneTimeEval: 200,
                reset: 300,
            }),
        );
        expect(objective.retryCost(0, 7)).toBe(200);
    });

    it('RetryKind.Rebuy retries at the full eval price even when its reset figure is lower, so retryCost equals entryCost', () => {
        const objective = toyObjective(
            feeToyPlan({
                activation: 0,
                monthlySubscription: 0,
                oneTimeEval: 200,
                reset: 50,
                retry: RetryKind.Rebuy,
            }),
        );
        expect(objective.retryCost(4, 7)).toBe(objective.entryCost(4));
    });

    it('the reset coupon discounts the retry and the eval coupon discounts the fresh start', () => {
        const objective = toyObjective(
            feeToyPlan({
                activation: 0,
                monthlySubscription: 0,
                oneTimeEval: 200,
                reset: 120,
            }),
            {
                discounts: {
                    activationPercent: percent(0),
                    evalPercent: percent(25),
                    resetPercent: percent(50),
                },
            },
        );
        expect(objective.retryCost(0, 7)).toBe(60);
        expect(objective.entryCost(0)).toBe(150);
    });

    it('a subscription plan whose reset equals one month retries at that month, the same as a fresh start, after a failed attempt of 0 days', () => {
        const objective = toyObjective(
            feeToyPlan({
                activation: 149,
                monthlySubscription: 49,
                oneTimeEval: 0,
                reset: 49,
            }),
        );
        expect(objective.retryCost(2, 0)).toBe(objective.entryCost(2));
    });

    describe.each([
        ['one-time-fee plan (MFFU Rapid EOD)', oneTimeFeePlan],
        [
            'monthly-subscription plan (TopStep Standard-Standard)',
            monthlySubscriptionPlan,
        ],
    ] as const)('%s', (_planLabel, planFactory) => {
        it.each([
            ['without discounts', undefined],
            ['with discounts', WITH_DISCOUNTS],
        ] as const)(
            'retryCost(0) %s equals the shared Plan.retryFee',
            (_discountLabel, discounts) => {
                const plan = planFactory();
                const objective = new RenewalCycleObjective({
                    discounts,
                    fundedHorizonDays: 252,
                    maxEvalDays: 60,
                    plan,
                    rebuyLagDays: 0,
                });
                expect(objective.retryCost(0, 0)).toBe(
                    plan.retryFee(discounts),
                );
            },
        );
    });
});

describe('copyAccounts applies the bundle discount to each fresh purchase, as the simulator does', () => {
    const fees = {
        activation: 100,
        monthlySubscription: 0,
        oneTimeEval: 200,
        reset: 120,
    };

    it('5 copies at a 10% bundle: the fresh eval costs $180 and activation $90, the retry stays at the $120 reset', () => {
        const objective = toyObjective(feeToyPlan(fees), { copyAccounts: 5 });
        expect(objective.entryCost(0)).toBeCloseTo(180, 9);
        expect(objective.activationCost()).toBeCloseTo(90, 9);
        expect(objective.retryCost(0, 7)).toBe(120);
    });

    it('below the bundle minimum (4 copies) nothing is discounted', () => {
        const objective = toyObjective(feeToyPlan(fees), { copyAccounts: 4 });
        expect(objective.entryCost(0)).toBe(200);
        expect(objective.activationCost()).toBe(100);
    });

    it('omitting copyAccounts prices a single account', () => {
        const objective = toyObjective(feeToyPlan(fees));
        expect(objective.entryCost(0)).toBe(200);
        expect(objective.activationCost()).toBe(100);
    });

    it.each([0, -1, 1.5, NaN, Infinity])(
        'throws on copyAccounts %s',
        (copyAccounts) => {
            expect(() =>
                toyObjective(feeToyPlan(fees), { copyAccounts }),
            ).toThrow(/copyAccounts/);
        },
    );
});

function calendarChainCost(
    plan: ReturnType<typeof feeToyPlan>,
    failedAttemptDays: readonly number[],
    passAttemptDays: number,
): number {
    const totalDays = failedAttemptDays.reduce(
        (sum, days) => sum + days,
        passAttemptDays,
    );
    return (
        plan.feesUntilPass(totalDays) +
        failedAttemptDays.length * plan.retryFee()
    );
}

function chainCost(
    objective: RenewalCycleObjective,
    failedAttemptDays: readonly number[],
    passAttemptDays: number,
): number {
    let total = objective.entryCost(0);
    for (const days of failedAttemptDays) {
        total +=
            sumEvalDayCost(objective, 0, days) + objective.retryCost(0, days);
    }
    return total + sumEvalDayCost(objective, 0, passAttemptDays);
}

describe('a reset does not restart the subscription billing cycle, so retryCost adds the prorated part of the month the failed attempt used (the D1 and simulator calendar billing)', () => {
    const SUBSCRIPTION = 119;
    const RESET = 109;
    const RESET_FEES = {
        activation: 0,
        monthlySubscription: SUBSCRIPTION,
        oneTimeEval: 0,
        reset: RESET,
    };

    it.each([
        [0, RESET],
        [1, RESET + SUBSCRIPTION / 21],
        [10, RESET + (SUBSCRIPTION * 10) / 21],
        [21, RESET + SUBSCRIPTION],
        [22, RESET + SUBSCRIPTION / 21],
        [42, RESET + SUBSCRIPTION],
        [50, RESET + (SUBSCRIPTION * 8) / 21],
    ])(
        'a failed attempt of %d days retries at %s: the 109-dollar reset plus the month days evalDayCost has not billed',
        (failedAttemptDays, expected) => {
            const objective = toyObjective(feeToyPlan(RESET_FEES), {
                rebuyLagDays: 0,
            });
            expect(objective.retryCost(0, failedAttemptDays)).toBeCloseTo(
                expected,
                9,
            );
        },
    );

    it('the monthly-subscription coupon discounts the prorated month the same way evalDayCost does', () => {
        const objective = toyObjective(feeToyPlan(RESET_FEES), {
            discounts: {
                activationPercent: percent(0),
                evalPercent: percent(0),
                monthlySubscriptionPercent: percent(5),
            },
            rebuyLagDays: 0,
        });
        expect(objective.retryCost(0, 10)).toBeCloseTo(
            RESET + (SUBSCRIPTION * 0.95 * 10) / 21,
            9,
        );
    });

    it.each([
        [[21], 5],
        [[21, 42], 22],
        [[63], 1],
    ] as const)(
        'failed attempts of %j days then a pass in %d days: the chain costs exactly the calendar-billed feesUntilPass(total days) plus one reset per retry',
        (failedAttemptDays, passAttemptDays) => {
            const plan = feeToyPlan(RESET_FEES);
            const objective = toyObjective(plan, { rebuyLagDays: 0 });
            expect(
                chainCost(objective, failedAttemptDays, passAttemptDays),
            ).toBeCloseTo(
                calendarChainCost(plan, failedAttemptDays, passAttemptDays),
                9,
            );
        },
    );

    it('averaged over every month residue of the failed attempt and of the passing attempt, the chain cost equals the calendar-billed cost, so the prorated model is unbiased when attempt lengths spread over the month', () => {
        const plan = feeToyPlan(RESET_FEES);
        const objective = toyObjective(plan, { rebuyLagDays: 0 });
        let modelTotal = 0;
        let calendarTotal = 0;
        let count = 0;
        for (let failed = 1; failed <= 21; failed += 1) {
            for (let passed = 1; passed <= 21; passed += 1) {
                modelTotal += chainCost(objective, [failed], passed);
                calendarTotal += calendarChainCost(plan, [failed], passed);
                count += 1;
            }
        }
        expect(modelTotal / count).toBeCloseTo(calendarTotal / count, 9);
    });

    it.each([0.5, 0.25, 0.1])(
        'attempts of whole months at pass rate %s: the expected chain cost equals D1 replacementEconomics costPerFundedAccount',
        (evalPassRate) => {
            const plan = feeToyPlan(RESET_FEES);
            const objective = toyObjective(plan, { rebuyLagDays: 0 });
            const attemptDays = 21;
            const expectedRetries = (1 - evalPassRate) / evalPassRate;
            const expectedChainCost =
                objective.entryCost(0) +
                expectedRetries *
                    (sumEvalDayCost(objective, 0, attemptDays) +
                        objective.retryCost(0, attemptDays)) +
                sumEvalDayCost(objective, 0, attemptDays);

            const d1 = replacementEconomics({
                discounts: undefined,
                evalPassRate,
                fees: plan.fees,
                meanDaysOnFail: attemptDays,
                meanDaysOnPass: attemptDays,
            });

            expect(expectedChainCost).toBeCloseTo(d1.costPerFundedAccount, 9);
        },
    );

    it('fail after 10 days, pass in 15: the prorated chain costs $109 + $119 * (1 + 10 / 21), between the calendar $347 and the $228 of a reset that restarts the billing clock', () => {
        const plan = feeToyPlan(RESET_FEES);
        const objective = toyObjective(plan, { rebuyLagDays: 0 });
        expect(calendarChainCost(plan, [10], 15)).toBe(347);
        expect(chainCost(objective, [10], 15)).toBeCloseTo(
            RESET + SUBSCRIPTION * (1 + 10 / 21),
            9,
        );
    });

    it('a one-time-fee plan has nothing to prorate: the retry is the reset alone whatever the failed attempt length', () => {
        const objective = toyObjective(
            feeToyPlan({
                activation: 0,
                monthlySubscription: 0,
                oneTimeEval: 200,
                reset: 120,
            }),
            { rebuyLagDays: 0 },
        );
        expect(objective.retryCost(0, 0)).toBe(120);
        expect(objective.retryCost(0, 13)).toBe(120);
        expect(objective.retryCost(0, 40)).toBe(120);
    });

    it('a re-buy is a new account whose first month is in the re-buy price, so the old billing cycle is not carried over', () => {
        const objective = toyObjective(
            feeToyPlan({
                activation: 0,
                monthlySubscription: SUBSCRIPTION,
                oneTimeEval: 50,
                reset: 300,
            }),
            { rebuyLagDays: 0 },
        );
        expect(objective.retryCost(0, 10)).toBe(50 + SUBSCRIPTION);
        expect(objective.retryCost(0, 10)).toBe(objective.entryCost(0));
    });
});

describe('a re-buy on a subscription plan bills each account from its own first month in the DP, D1 and the simulator alike (N-60)', () => {
    const REBUY_FEES = {
        activation: 0,
        monthlySubscription: 100,
        oneTimeEval: 30,
        reset: 1000,
    };

    it.each([
        [[10, 10], 10, 3 * (30 + 100)],
        [[15], 15, 2 * (30 + 100)],
        [[25], 10, 2 * (30 + 100) + 100],
    ] as const)(
        'failed attempts of %j days then a pass in %d days cost %d: one eval plus one month per account, plus each month an attempt runs past its first',
        (failedAttemptDays, passAttemptDays, expected) => {
            const objective = toyObjective(feeToyPlan(REBUY_FEES), {
                rebuyLagDays: 0,
            });
            expect(
                chainCost(objective, failedAttemptDays, passAttemptDays),
            ).toBeCloseTo(expected, 9);
        },
    );

    it.each([
        [0.5, 15, 15],
        [0.25, 10, 30],
        [0.1, 25, 5],
    ])(
        'at pass rate %s with %d-day failures and %d-day passes the expected DP chain cost equals D1 replacementEconomics costPerFundedAccount',
        (evalPassRate, failDays, passDays) => {
            const plan = feeToyPlan(REBUY_FEES);
            const objective = toyObjective(plan, { rebuyLagDays: 0 });
            const expectedRetries = (1 - evalPassRate) / evalPassRate;
            const expectedChainCost =
                objective.entryCost(0) +
                expectedRetries *
                    (sumEvalDayCost(objective, 0, failDays) +
                        objective.retryCost(0, failDays)) +
                sumEvalDayCost(objective, 0, passDays);

            const d1 = replacementEconomics({
                attemptDays: { failDays: [failDays], passDays: [passDays] },
                discounts: undefined,
                evalPassRate,
                fees: plan.fees,
                meanDaysOnFail: failDays,
                meanDaysOnPass: passDays,
            });

            expect(expectedChainCost).toBeCloseTo(d1.costPerFundedAccount, 9);
        },
    );
});
