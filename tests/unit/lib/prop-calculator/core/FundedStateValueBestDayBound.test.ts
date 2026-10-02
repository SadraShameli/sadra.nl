import { describe, expect, it } from 'vitest';

import {
    ConsistencyRule,
    ConsistencyScope,
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

const TOY_CONFIG = {
    actionStepMultiple: 0.5,
    convergenceTolerance: 0.01,
    cushionStepMultiple: 0.5,
    evalInitialValue: 0,
    feePerAttempt: dollars(0),
    maxActionMultiple: 1,
    maxCushionMultiple: 6,
    rrRatio: 2,
    tradesPerDay: 2,
    winrate: 0.5,
} as const;

function consistencyToyPlan(): Plan {
    const base = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!base) throw new Error('MFF Rapid EOD 50K plan not found');
    return base.withOverrides({
        accountSize: dollars(1000),
        consistency: null,
        contractLimits: undefined,
        drawdown: new EodTrailingDrawdown({ amount: dollars(100) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedConsistency: {
            kind: 'set',
            rule: new ConsistencyRule(ConsistencyScope.Funded, fraction(0.4)),
        },
        fundedDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(100),
            lock: { atProfit: dollars(150), lockedThreshold: () => 1000 },
        }),
        isInstantFunded: true,
        maxConsecutiveIdleDays: undefined,
        maxLifetimePayouts: 2,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(0),
        minPayoutProfitPerCycle: dollars(0.01),
        minPayoutRequest: dollars(0),
        minQualifyingDayProfit: null,
        minTradingDays: 0,
        payoutBalanceShareCap: undefined,
        payoutRequestCap: undefined,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
    });
}

function solve(
    maxTailCushionMultiple: number,
    cycleBestDayBucketCount?: number,
    overrides: {
        convergenceTolerance?: number;
        rrRatio?: number;
        tailCushionStepMultiple?: number;
        tradesPerDay?: number;
        winrate?: number;
    } = {},
) {
    const result = computeFundedStateValue({
        ...TOY_CONFIG,
        ...overrides,
        cycleBestDayBucketCount,
        maxTailCushionMultiple,
        plan: consistencyToyPlan(),
    });
    expect(result.unconvergedLevelCount).toBe(0);
    return result;
}

describe('computeFundedStateValue bounds the default best-day grid on a consistency-tracked plan (WP58d, N-86 stage 2 leftover)', () => {
    it('grows its state count with the cushion grid alone, not 6x with the tail: a day cannot win more than tradesPerDay times the largest win, so the best-day dimension stops at that bound however far the cushion tail reaches', () => {
        const noTail = solve(6).reachedStateCount;
        const withTail = solve(30).reachedStateCount;
        expect(noTail).toBe(470);
        expect(withTail).toBe(1235);
        expect(withTail / noTail).toBeLessThan(3);
    }, 120_000);

    it('moves the value by no more than 0.05 (five convergence tolerances, 0.005 percent of the toy value) against a best-day grid with 60 buckets that is never clamped', () => {
        const bounded = solve(30);
        const unbounded = solve(30, 60);
        expect(unbounded.reachedStateCount).toBeGreaterThan(
            4 * bounded.reachedStateCount,
        );
        expect(
            Math.abs(bounded.initialValue - unbounded.initialValue),
        ).toBeLessThan(0.05);
        expect(bounded.initialValue).toBeGreaterThan(900);
    }, 120_000);

    it('leaves a tail-off grid, where the bound does not bind, exactly as it was', () => {
        const noTail = solve(6);
        expect(noTail.initialValue).toBeCloseTo(412.74763806206516, 6);
    }, 120_000);

    it('stays within 0.05 of a 80-bucket best-day grid on a longer, higher-reward day with a lock trigger inside the working range, where the cap binds hardest (the one-day swing is 9 drawdowns)', () => {
        const wideDay = { rrRatio: 3, tradesPerDay: 3 } as const;
        const bounded = solve(30, undefined, wideDay);
        const wide = solve(30, 80, wideDay);
        expect(bounded.reachedStateCount).toBeLessThan(wide.reachedStateCount);
        expect(Math.abs(bounded.initialValue - wide.initialValue)).toBeLessThan(
            0.05,
        );
    }, 120_000);

    it('fails closed on a day past the cap: with a coarse tail that lets a win land a whole tail step above the fine-grid cap, a capped day blocks payouts instead of being clamped, so the capped value is 5,477.47 where the old clamp gave 5,914.05, and it stays below the 300-bucket grid that never clamps (6,132.41)', () => {
        const overCapDay = {
            convergenceTolerance: 1e-6,
            rrRatio: 3,
            tailCushionStepMultiple: 4,
            tradesPerDay: 3,
            winrate: 0.8,
        } as const;
        const capped = solve(40, undefined, overCapDay);
        const uncapped = solve(40, 300, overCapDay);
        expect(capped.initialValue).toBeCloseTo(5477.469760802233, 4);
        expect(uncapped.initialValue).toBeCloseTo(6132.405714537264, 4);
        expect(capped.initialValue).toBeLessThan(uncapped.initialValue);
    }, 120_000);
});
