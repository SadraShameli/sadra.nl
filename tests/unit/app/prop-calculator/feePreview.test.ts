import { describe, expect, it } from 'vitest';

import {
    describeActivationFee,
    describeEvalFee,
    describeMonthlySubscriptionFee,
    purchaseCouponDiscounts,
} from '~/app/(app)/prop-calculator/_components/feePreview';
import { describeResetFee } from '~/app/(app)/prop-calculator/_components/retryDescription';
import {
    dollars,
    type FeeSchedule,
    findFirm,
    FirmId,
    FundedNextVariant,
    initialEvalFee,
    LucidVariant,
    monthlySubscriptionFee,
    percent,
    type Plan,
    type PlanId,
    resetFee,
} from '~/lib/prop-calculator';

const NO_COUPON = {
    activationDiscountPercent: 0,
    evalDiscountPercent: 0,
    linkActivationDiscount: false,
    monthlySubscriptionDiscountPercent: 0,
    resetDiscountPercent: 0,
};

function findPlan(planId: PlanId): Plan {
    const plan = findFirm(planId.firm)?.findPlan(planId);
    if (!plan) throw new Error(`plan not found: ${JSON.stringify(planId)}`);
    return plan;
}

function lucidProNoDll(): Plan {
    return findPlan({
        accountSize: 50_000,
        firm: FirmId.Lucid,
        variant: LucidVariant.ProNoDll,
    });
}

describe('web fee previews price the eval like the engine (N-52 web half)', () => {
    it('keeps the Lucid no-DLL add-on outside the eval coupon: $140.40 at 30%, not $134.40', () => {
        const plan = lucidProNoDll();
        const discounts = purchaseCouponDiscounts(
            plan,
            { ...NO_COUPON, evalDiscountPercent: 30 },
            1,
        );

        expect(initialEvalFee(plan.fees, discounts)).toBeCloseTo(140.4, 10);
        expect(describeEvalFee(plan.fees, discounts)).toBe('$192 → $140');
    });

    it('shows the undiscounted checkout price with no coupon', () => {
        const plan = lucidProNoDll();

        expect(
            describeEvalFee(
                plan.fees,
                purchaseCouponDiscounts(plan, NO_COUPON, 1),
            ),
        ).toBe('$192');
    });

    it('applies the automatic basket discount the engine applies for the account count', () => {
        const plan = findPlan({
            accountSize: 50_000,
            firm: FirmId.FundedNext,
            variant: FundedNextVariant.Legacy,
        });
        const discounts = purchaseCouponDiscounts(plan, NO_COUPON, 5);

        expect(discounts?.bundlePercent).toBeCloseTo(3, 10);
        expect(discounts?.bundlePercent).toBe(
            plan.purchaseDiscounts(undefined, 5)?.bundlePercent,
        );
        expect(describeEvalFee(plan.fees, discounts)).toBe('$200 → $194');
        expect(
            describeEvalFee(
                plan.fees,
                purchaseCouponDiscounts(plan, NO_COUPON, 1),
            ),
        ).toBe('$200');
    });

    it('says so when the plan has no eval fee', () => {
        const free: FeeSchedule = {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(0),
            reset: dollars(0),
        };
        expect(describeEvalFee(free, undefined)).toBe('no eval fee');
    });
});

describe('web activation preview uses the engine activation fee', () => {
    const fees: FeeSchedule = {
        activation: dollars(200),
        monthlySubscription: dollars(0),
        oneTimeEval: dollars(100),
        reset: dollars(0),
    };

    it('stacks the activation coupon and the bundle discount', () => {
        expect(
            describeActivationFee(fees, {
                activationPercent: percent(10),
                bundlePercent: percent(5),
                evalPercent: percent(0),
            }),
        ).toBe('$200 → $171');
    });

    it('uses the eval coupon when the activation coupon is linked to it', () => {
        const plan = lucidProNoDll();
        expect(
            purchaseCouponDiscounts(
                plan,
                {
                    ...NO_COUPON,
                    activationDiscountPercent: 5,
                    evalDiscountPercent: 40,
                    linkActivationDiscount: true,
                },
                1,
            )?.activationPercent,
        ).toBe(40);
    });

    it('says so when the plan has no activation fee', () => {
        expect(
            describeActivationFee(
                { ...fees, activation: dollars(0) },
                undefined,
            ),
        ).toBe('no activation fee');
    });
});

describe('web reset preview uses the engine reset fee (N-52 reset half)', () => {
    it('keeps the Lucid no-DLL reset add-on outside the reset coupon: $104 at 30%, not $98', () => {
        const plan = lucidProNoDll();
        const discounts = purchaseCouponDiscounts(
            plan,
            { ...NO_COUPON, resetDiscountPercent: 30 },
            1,
        );

        expect(resetFee(plan.fees, discounts)).toBeCloseTo(104, 10);
        expect(describeResetFee(plan.fees, discounts)).toBe('$140 → $104');
    });

    it('floors a promo-carrying reset at $0 under a 100% coupon', () => {
        const plan = findPlan({
            accountSize: 50_000,
            firm: FirmId.Lucid,
            variant: LucidVariant.Pro,
        });
        const discounts = purchaseCouponDiscounts(
            plan,
            { ...NO_COUPON, resetDiscountPercent: 100 },
            1,
        );

        expect(describeResetFee(plan.fees, discounts)).toBe('$115 → $0');
    });
});

describe('web monthly subscription preview uses the engine subscription fee', () => {
    const fees: FeeSchedule = {
        activation: dollars(0),
        monthlySubscription: dollars(139),
        oneTimeEval: dollars(0),
        reset: dollars(0),
    };

    it('applies the monthly subscription coupon: $139 at 20% is $111.20', () => {
        const discounts = {
            activationPercent: percent(0),
            evalPercent: percent(0),
            monthlySubscriptionPercent: percent(20),
        };

        expect(monthlySubscriptionFee(fees, discounts)).toBeCloseTo(
            111.2,
            10,
        );
        expect(describeMonthlySubscriptionFee(fees, discounts)).toBe(
            '$139 → $111',
        );
    });

    it('leaves the subscription out of the automatic bundle discount, as the engine does', () => {
        const discounts = {
            activationPercent: percent(0),
            bundlePercent: percent(10),
            evalPercent: percent(0),
        };

        expect(monthlySubscriptionFee(fees, discounts)).toBe(139);
        expect(describeMonthlySubscriptionFee(fees, discounts)).toBe('$139');
    });

    it('shows the listed price with no coupon', () => {
        expect(describeMonthlySubscriptionFee(fees, undefined)).toBe('$139');
    });

    it('says so when the plan has no monthly subscription', () => {
        expect(
            describeMonthlySubscriptionFee(
                { ...fees, monthlySubscription: dollars(0) },
                undefined,
            ),
        ).toBe('no monthly subscription');
    });
});
