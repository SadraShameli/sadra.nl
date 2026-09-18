import { describe, expect, it } from 'vitest';

import {
    type FeeSchedule,
    feesUntilPass,
    resetFactor,
    totalFees,
} from '~/lib/prop-calculator/core/FeeSchedule';
import { dollars, percent } from '~/lib/prop-calculator/core/lib/units';

const fees: FeeSchedule = {
    activation: dollars(149),
    monthlySubscription: dollars(49),
    oneTimeEval: dollars(0),
    reset: dollars(49),
};

describe('totalFees', () => {
    it('charges a minimum of one month even for a same-day pass', () => {
        expect(totalFees(fees, 0)).toBe(149 + 49);
        expect(totalFees(fees, 1)).toBe(149 + 49);
    });

    it('does not roll into a second month until day 22', () => {
        expect(totalFees(fees, 21)).toBe(149 + 49 * 1);
        expect(totalFees(fees, 22)).toBe(149 + 49 * 2);
    });

    it('scales the monthly subscription linearly with elapsed months', () => {
        expect(totalFees(fees, 42)).toBe(149 + 49 * 2);
        expect(totalFees(fees, 43)).toBe(149 + 49 * 3);
        expect(totalFees(fees, 252)).toBe(149 + 49 * 12);
    });

    it('is invariant to how those days are attributed, only their count', () => {
        expect(totalFees(fees, 6)).toBe(totalFees(fees, 6));
        expect(totalFees(fees, 6)).not.toBe(totalFees(fees, 252));
    });

    it('never charges the monthly subscription for a firm that has none', () => {
        const noSubscription: FeeSchedule = {
            ...fees,
            monthlySubscription: dollars(0),
        };
        expect(totalFees(noSubscription, 21)).toBe(149);
        expect(totalFees(noSubscription, 252)).toBe(149);
        expect(totalFees(noSubscription, 5000)).toBe(149);
    });

    it('applies activation/eval discounts and leaves the monthly subscription untouched when no monthly discount is given', () => {
        const discounted = totalFees(fees, 21, {
            activationPercent: percent(50),
            evalPercent: percent(100),
        });
        expect(discounted).toBe(149 * 0.5 + 0 + 49);
    });

    it('applies a monthly-subscription discount when one is given, on top of activation/eval discounts', () => {
        const discounted = totalFees(fees, 42, {
            activationPercent: percent(50),
            evalPercent: percent(0),
            monthlySubscriptionPercent: percent(40),
        });
        expect(discounted).toBe(149 * 0.5 + 0 + 49 * 0.6 * 2);
    });

    it('a monthly discount alone, with no activation/eval discount, only reduces the subscription line', () => {
        const discounted = totalFees(fees, 21, {
            activationPercent: percent(0),
            evalPercent: percent(0),
            monthlySubscriptionPercent: percent(40),
        });
        expect(discounted).toBe(149 + 0 + 49 * 0.6);
    });
});

describe('feesUntilPass', () => {
    it('excludes the activation fee, unlike totalFees', () => {
        expect(feesUntilPass(fees, 21)).toBe(49);
        expect(totalFees(fees, 21)).toBe(feesUntilPass(fees, 21) + 149);
    });

    it('matches totalFees month-rounding behavior', () => {
        expect(feesUntilPass(fees, 22)).toBe(49 * 2);
    });
});

describe('resetFactor', () => {
    it('is 1 (no discount) when discounts are undefined or resetPercent is unset', () => {
        expect(resetFactor(undefined)).toBe(1);
        expect(
            resetFactor({
                activationPercent: percent(0),
                evalPercent: percent(0),
            }),
        ).toBe(1);
    });

    it('reduces the reset fee by resetPercent', () => {
        expect(
            resetFactor({
                activationPercent: percent(0),
                evalPercent: percent(0),
                resetPercent: percent(40),
            }),
        ).toBe(0.6);
    });
});
