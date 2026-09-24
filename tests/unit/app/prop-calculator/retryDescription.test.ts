import { describe, expect, it } from 'vitest';

import {
    describeResetFee,
    describeRetryOnBust,
    hasResetOption,
} from '~/app/(app)/prop-calculator/_components/retryDescription';
import {
    type CouponDiscounts,
    dollars,
    type FeeSchedule,
    percent,
    RetryKind,
} from '~/lib/prop-calculator';

const NO_FEES: FeeSchedule = {
    activation: dollars(0),
    monthlySubscription: dollars(0),
    oneTimeEval: dollars(0),
    reset: dollars(0),
};

const CHEAP_RESET: FeeSchedule = {
    ...NO_FEES,
    oneTimeEval: dollars(165),
    reset: dollars(115),
};

const PRICEY_RESET: FeeSchedule = {
    ...NO_FEES,
    oneTimeEval: dollars(160),
    reset: dollars(175),
};

const NO_RESET: FeeSchedule = {
    ...NO_FEES,
    oneTimeEval: dollars(153),
    retry: RetryKind.Rebuy,
};

const HALF_OFF_RESET: CouponDiscounts = {
    activationPercent: percent(0),
    evalPercent: percent(0),
    resetPercent: percent(50),
};

describe('describeRetryOnBust (WP08 handoff: retries at the D1 price; T29: a timed-out attempt is retried too; T10: a re-buy is a new account)', () => {
    it('names the reset when the reset is the cheaper retry', () => {
        expect(describeRetryOnBust(CHEAP_RESET, undefined, 3)).toBe(
            'Up to 2 resets at $115 each when an attempt busts or times out.',
        );
    });

    it('names a re-buy when a fresh eval is cheaper than the reset', () => {
        expect(describeRetryOnBust(PRICEY_RESET, undefined, 2)).toBe(
            'Up to 1 re-buy at $160 each when an attempt busts or times out; a re-buy is a new account.',
        );
    });

    it('names a re-buy for a plan that sells no reset', () => {
        expect(describeRetryOnBust(NO_RESET, undefined, 3)).toBe(
            'Up to 2 re-buys at $153 each when an attempt busts or times out; a re-buy is a new account.',
        );
    });

    it('prices the retry with the coupon', () => {
        const fees: FeeSchedule = {
            ...NO_FEES,
            oneTimeEval: dollars(200),
            reset: dollars(100),
        };
        expect(describeRetryOnBust(fees, HALF_OFF_RESET, 2)).toBe(
            'Up to 1 reset at $50 each when an attempt busts or times out.',
        );
    });

    it('prices a subscription re-buy with its first month and calls it a new account', () => {
        const subscriptionRebuy: FeeSchedule = {
            ...NO_FEES,
            monthlySubscription: dollars(100),
            oneTimeEval: dollars(30),
            retry: RetryKind.Rebuy,
        };
        expect(describeRetryOnBust(subscriptionRebuy, undefined, 3)).toBe(
            'Up to 2 re-buys at $130 each when an attempt busts or times out; a re-buy is a new account.',
        );
    });

    it('says nothing for a single attempt or a free retry', () => {
        expect(describeRetryOnBust(CHEAP_RESET, undefined, 1)).toBeNull();
        expect(describeRetryOnBust(NO_FEES, undefined, 3)).toBeNull();
    });
});

describe('describeResetFee and hasResetOption', () => {
    it('shows the re-buy price for a plan that sells no reset', () => {
        expect(hasResetOption(NO_RESET)).toBe(false);
        expect(describeResetFee(NO_RESET, 0)).toBe('no reset, re-buy at $153');
    });

    it('shows the discounted reset fee', () => {
        const withReset: FeeSchedule = { ...NO_FEES, reset: dollars(100) };
        expect(hasResetOption(withReset)).toBe(true);
        expect(describeResetFee(withReset, 0)).toBe('$100');
        expect(describeResetFee(withReset, 40)).toBe('$100 → $60');
    });

    it('treats a zero reset fee as no reset option', () => {
        expect(hasResetOption(NO_FEES)).toBe(false);
        expect(describeResetFee(NO_FEES, 0)).toBe('no reset fee');
    });
});
