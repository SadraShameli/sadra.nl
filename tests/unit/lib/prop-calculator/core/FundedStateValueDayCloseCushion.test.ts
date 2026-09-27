import { describe, expect, it } from 'vitest';

import {
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    MffuVariant,
    type Plan,
} from '~/lib/prop-calculator/core';
import { computeFundedStateValue } from '~/lib/prop-calculator/core/FundedStateValue';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';

const TOY_DRAWDOWN = 1000;
const TOY_ACCOUNT_SIZE = 1000;
const TOY_CUSHION_STEP_MULTIPLE = 0.25;
const CUSHION_STEP_DOLLARS = TOY_CUSHION_STEP_MULTIPLE * TOY_DRAWDOWN;
const DAY_ONE_WIN = 500;
const LOCK_TRIGGER = DAY_ONE_WIN - 1;
const DAY_ONE_CLOSE_BALANCE = TOY_ACCOUNT_SIZE + DAY_ONE_WIN;

function initialValueAtLockedCushion(cushionAfterLockDollars: number): number {
    return computeFundedStateValue({
        actionStepMultiple: DAY_ONE_WIN / TOY_DRAWDOWN,
        cushionStepMultiple: TOY_CUSHION_STEP_MULTIPLE,
        cycleBestDayBucketCount: 1,
        evalInitialValue: 0,
        feePerAttempt: dollars(0),
        maxActionMultiple: DAY_ONE_WIN / TOY_DRAWDOWN,
        plan: locksAtCushionToyPlan(cushionAfterLockDollars),
        rrRatio: 1,
        tradesPerDay: 1,
        winrate: 1,
    }).initialValue;
}

function locksAtCushionToyPlan(cushionAfterLockDollars: number): Plan {
    const rapidEod = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!rapidEod) throw new Error('MFF Rapid EOD 50K plan not found');
    const lockedThresholdDollars =
        DAY_ONE_CLOSE_BALANCE - cushionAfterLockDollars;
    return rapidEod.withOverrides({
        accountSize: dollars(TOY_ACCOUNT_SIZE),
        consistency: null,
        contractLimits: undefined,
        drawdown: new EodTrailingDrawdown({ amount: dollars(TOY_DRAWDOWN) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedConsistency: { kind: 'set', rule: null },
        fundedDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(TOY_DRAWDOWN),
            lock: {
                atProfit: dollars(LOCK_TRIGGER),
                lockedThreshold: () => lockedThresholdDollars,
            },
        }),
        isInstantFunded: true,
        maxLifetimePayouts: 1,
        minDaysAfterPassForPayout: 2,
        minPayoutProfit: dollars(0),
        minPayoutProfitPerCycle: dollars(0),
        minPayoutRequest: dollars(0),
        minQualifyingDayProfit: null,
        minRetainedCushionOverride: dollars(0),
        minTradingDays: 0,
        payoutBalanceShareCap: undefined,
        payoutRequestCap: undefined,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
    });
}

describe('the funded DP interpolates the day-close cushion instead of flooring it (N-86)', () => {
    it('values a locked day-close cushion that lands exactly on the breach line at exactly the breach value', () => {
        expect(initialValueAtLockedCushion(0)).toBe(0);
    });

    it('values a locked day-close cushion just below a cell floor above the strict floor value the old code rounded it down to', () => {
        const justBelowTheNextStep = CUSHION_STEP_DOLLARS - 1;
        expect(
            initialValueAtLockedCushion(justBelowTheNextStep),
        ).toBeGreaterThan(0);
    }, 60_000);

    it('keeps the day-close path smooth across a cell boundary instead of a plateau-then-cliff step', () => {
        const justBelow = initialValueAtLockedCushion(
            CUSHION_STEP_DOLLARS - 1,
        );
        const atTheBoundary = initialValueAtLockedCushion(CUSHION_STEP_DOLLARS);
        const justAbove = initialValueAtLockedCushion(
            CUSHION_STEP_DOLLARS + 1,
        );
        expect(justBelow).toBeLessThanOrEqual(atTheBoundary);
        expect(atTheBoundary).toBeLessThanOrEqual(justAbove);
        expect(atTheBoundary - justBelow).toBeLessThan(
            0.1 * atTheBoundary,
        );
    }, 60_000);
});
