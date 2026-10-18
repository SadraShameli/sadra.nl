import { describe, expect, it } from 'vitest';

import {
    type CouponDiscounts,
    FirmId,
    MffuVariant,
    percent,
    type Plan,
    replacementEconomics,
    RetryKind,
    retryPath,
} from '~/lib/prop-calculator/core';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { type SimOutputs, simulate } from '~/lib/prop-calculator/simulator';

const RAPID_EVAL_FEE = 209;

const RESET_COUPON: CouponDiscounts = {
    activationPercent: percent(0),
    evalPercent: percent(0),
    resetPercent: percent(50),
};

const EVAL_AND_RESET_COUPON: CouponDiscounts = {
    activationPercent: percent(0),
    evalPercent: percent(20),
    resetPercent: percent(50),
};

function costOutputs(out: SimOutputs) {
    return {
        costBreakdown: out.costBreakdown,
        costPerFundedAccount: out.costPerFundedAccount,
        expectedNet: out.expectedNet,
        expectedTotalCost: out.expectedTotalCost,
    };
}

function multiAttemptRun(plan: Plan, discounts?: CouponDiscounts) {
    return simulate({
        discounts,
        fundedHorizonDays: 20,
        maxAttempts: 4,
        maxEvalDays: 15,
        plan,
        riskPerTrade: 400,
        rrRatio: 1.5,
        seed: 52,
        tradesPerDay: 2,
        trials: 400,
        winrate: 0.45,
    });
}

function rapid() {
    const plan = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Rapid,
    });
    if (!plan) throw new Error('MFFU Rapid 50K plan not found');
    return plan;
}

function rapidOnCheaperPath() {
    const plan = rapid();
    return plan.withOverrides({ fees: { ...plan.fees, retry: undefined } });
}

describe('MFFU Rapid 50K retry is a re-buy (N-84: the Rapid plan page FAQ says "There is no reset")', () => {
    it('forces every failed evaluation onto the re-buy path, as Builder does', () => {
        expect(rapid().fees.retry).toBe(RetryKind.Rebuy);
    });

    it('does not let a reset-only coupon discount a reset that does not exist', () => {
        const plan = rapid();
        expect(retryPath(plan.fees, RESET_COUPON)).toBe(RetryKind.Rebuy);
        expect(plan.retryFee(RESET_COUPON)).toBe(RAPID_EVAL_FEE);
    });

    it('prices each retry at the eval-discounted re-buy, whatever the reset coupon says', () => {
        expect(rapid().retryFee(EVAL_AND_RESET_COUPON)).toBeCloseTo(
            RAPID_EVAL_FEE * 0.8,
            10,
        );
    });

    it('prices a replacement funded account with re-buys under a reset coupon', () => {
        const economics = replacementEconomics({
            discounts: RESET_COUPON,
            evalPassRate: 0.25,
            fees: rapid().fees,
            meanDaysOnFail: 6,
            meanDaysOnPass: 9,
        });
        expect(economics.costPerFundedAccount).toBeCloseTo(
            4 * RAPID_EVAL_FEE,
            10,
        );
    });
});

describe('MFFU Rapid 50K list-price outputs are unchanged by the re-buy retry (N-84 pin)', () => {
    it('keeps the $209 eval fee, the $209 retry fee and the $0 subscription', () => {
        const plan = rapid();
        expect(plan.fees.oneTimeEval).toBe(RAPID_EVAL_FEE);
        expect(plan.fees.reset).toBe(RAPID_EVAL_FEE);
        expect(plan.fees.monthlySubscription).toBe(0);
        expect(plan.retryFee()).toBe(RAPID_EVAL_FEE);
    });

    it('bills one full $209 evaluation per failed attempt that is followed by another', () => {
        const out = simulate({
            fundedHorizonDays: 10,
            maxAttempts: 3,
            maxEvalDays: 5,
            plan: rapid(),
            riskPerTrade: 2100,
            rrRatio: 1,
            seed: 9,
            tradesPerDay: 1,
            trials: 1,
            winrate: 0,
        });

        expect(out.bustProbability).toBe(1);
        expect(out.costBreakdown.resetFeesTotal).toBe(2 * RAPID_EVAL_FEE);
    });

    it('keeps the list-price replacement cost per funded account at 1 / pass rate evaluations', () => {
        const economics = replacementEconomics({
            discounts: undefined,
            evalPassRate: 0.25,
            fees: rapid().fees,
            meanDaysOnFail: 6,
            meanDaysOnPass: 9,
        });
        expect(economics.costPerFundedAccount).toBeCloseTo(
            4 * RAPID_EVAL_FEE,
            10,
        );
        expect(economics.attemptsPerFundedAccount).toBe(4);
    });

    it('keeps seeded multi-attempt costs equal to the same plan on the cheaper-path retry', () => {
        const rebuy = costOutputs(multiAttemptRun(rapid()));
        const cheaperPath = costOutputs(multiAttemptRun(rapidOnCheaperPath()));
        expect(rebuy).toStrictEqual(cheaperPath);
    });
});

describe('MFFU Rapid 50K retries under a reset coupon cost the re-buy, not the discounted reset (N-84)', () => {
    it('bills more retry fees than the same plan on the cheaper-path retry', () => {
        const rebuy = multiAttemptRun(rapid(), RESET_COUPON);
        const cheaperPath = multiAttemptRun(rapidOnCheaperPath(), RESET_COUPON);
        expect(cheaperPath.costBreakdown.resetFeesTotal).toBeGreaterThan(0);
        expect(rebuy.costBreakdown.resetFeesTotal).toBeCloseTo(
            2 * cheaperPath.costBreakdown.resetFeesTotal,
            10,
        );
        expect(rebuy.expectedTotalCost).toBeGreaterThan(
            cheaperPath.expectedTotalCost,
        );
    });
});
