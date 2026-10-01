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

const FIXED_GRID_TOP = 1000;
const CUSHION_STEP_DOLLARS = 250;
const LOCK_TRIGGER = 1100;
const ON_GRID_LOCKED_VALUE = 2000;

function initialValueAtOffsetExcess(
    offsetExcessDollars: number,
    stepDollars = CUSHION_STEP_DOLLARS,
): number {
    const amount = FIXED_GRID_TOP - offsetExcessDollars;
    return computeFundedStateValue({
        actionStepMultiple: 1,
        cushionStepMultiple: stepDollars / amount,
        cycleBestDayBucketCount: 1,
        evalInitialValue: 0,
        feePerAttempt: dollars(0),
        maxActionMultiple: 1,
        plan: offGridOffsetToyPlan(amount),
        rrRatio: FIXED_GRID_TOP / amount,
        tradesPerDay: 1,
        winrate: 1,
    }).initialValue;
}

function offGridOffsetToyPlan(amount: number): Plan {
    const rapidEod = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!rapidEod) throw new Error('MFF Rapid EOD 50K plan not found');
    return rapidEod.withOverrides({
        accountSize: dollars(amount),
        consistency: null,
        contractLimits: undefined,
        drawdown: new EodTrailingDrawdown({ amount: dollars(amount) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedConsistency: { kind: 'set', rule: null },
        fundedDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(amount),
            lock: {
                atProfit: dollars(LOCK_TRIGGER),
                lockedThreshold: () => amount,
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

describe('the funded DP interpolates the unlocked pre-lock threshold offset instead of flooring it (N-86 round 2)', () => {
    it('values a pre-lock offset exactly on the offset-grid line at the fully-favoured locked value', () => {
        expect(initialValueAtOffsetExcess(CUSHION_STEP_DOLLARS)).toBeCloseTo(
            ON_GRID_LOCKED_VALUE,
            0,
        );
    }, 60_000);

    it('values an off-grid pre-lock offset just below the next offset cell above the value the old code floors it to', () => {
        const justBelowTheNextCell = initialValueAtOffsetExcess(
            CUSHION_STEP_DOLLARS - 1,
        );
        expect(justBelowTheNextCell).toBeGreaterThan(1900);
    }, 60_000);

    it('keeps the pre-lock offset path continuous approaching an offset-grid boundary instead of collapsing to the lower cell value', () => {
        const atTheBoundary = initialValueAtOffsetExcess(CUSHION_STEP_DOLLARS);
        const justBelow = initialValueAtOffsetExcess(CUSHION_STEP_DOLLARS - 1);
        expect(atTheBoundary - justBelow).toBeLessThan(0.1 * atTheBoundary);
    }, 60_000);

    it('keeps the same near-boundary continuity across two resolutions that straddle an offset-bucket boundary', () => {
        const coarseStep = CUSHION_STEP_DOLLARS;
        const fineStep = CUSHION_STEP_DOLLARS / 2;
        const coarseGap =
            ON_GRID_LOCKED_VALUE -
            initialValueAtOffsetExcess(coarseStep - 1, coarseStep);
        const fineGap =
            ON_GRID_LOCKED_VALUE -
            initialValueAtOffsetExcess(fineStep - 1, fineStep);
        expect(coarseGap).toBeLessThan(0.1 * ON_GRID_LOCKED_VALUE);
        expect(fineGap).toBeLessThan(0.1 * ON_GRID_LOCKED_VALUE);
    }, 60_000);
});
