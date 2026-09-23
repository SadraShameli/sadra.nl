import { describe, expect, it } from 'vitest';

import {
    MffuVariant,
    percent,
    TopStepVariant,
    TRADING_DAYS_PER_MONTH,
} from '~/lib/prop-calculator/core';
import { RenewalCycleObjective } from '~/lib/prop-calculator/core/RenewalCycleObjective';
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
