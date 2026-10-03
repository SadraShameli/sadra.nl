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
        actionStepMultiple?: number;
        convergenceTolerance?: number;
        cushionStepMultiple?: number;
        meanHorizonDays?: number;
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

const COARSE_TOY = {
    actionStepMultiple: 1,
    cushionStepMultiple: 1,
    meanHorizonDays: 20,
} as const;

describe('computeFundedStateValue bounds the default best-day grid on a consistency-tracked plan (WP58d, N-86 stage 2 leftover; PT-T1b: the toy is solved at action step 1 drawdown instead of 0.5, and where it compares against a never-clamped grid also at cushion step 1 drawdown, a 20 day horizon and a 12 drawdown tail instead of 30, because the 60 bucket solves took 5 to 55 s)', () => {
    it('grows its state count with the cushion grid alone, not 6x with the tail: a day cannot win more than tradesPerDay times the largest win, so the best-day dimension stops at that bound however far the cushion tail reaches (WP58e: the cap now allows one tail step per trade of grid rounding, so 1,235 states became 1,425; the state count does not depend on the action step, so the pins are unchanged at action step 1)', () => {
        const noTail = solve(6, undefined, {
            actionStepMultiple: 1,
        }).reachedStateCount;
        const withTail = solve(30, undefined, {
            actionStepMultiple: 1,
        }).reachedStateCount;
        expect(noTail).toBe(470);
        expect(withTail).toBe(1425);
        expect(withTail / noTail).toBeLessThan(3.5);
    });

    it('moves the value by no more than 0.05 (five convergence tolerances, 0.005 percent of the toy value) against a best-day grid with 60 buckets that is never clamped, at a 12 drawdown tail (the pre-PT-T1b run at a 30 drawdown tail moved it by 0.008 and earned 933.13 with no horizon; here the toy earns 342.64 over a 20 day horizon)', () => {
        const bounded = solve(12, undefined, COARSE_TOY);
        const unbounded = solve(12, 60, COARSE_TOY);
        expect(unbounded.reachedStateCount).toBeGreaterThan(
            4 * bounded.reachedStateCount,
        );
        expect(
            Math.abs(bounded.initialValue - unbounded.initialValue),
        ).toBeLessThan(0.05);
        expect(bounded.initialValue).toBeGreaterThan(300);
    });

    it('leaves a tail-off grid, where the bound does not bind, exactly as it was', () => {
        const noTail = solve(6);
        expect(noTail.initialValue).toBeCloseTo(412.74763806206516, 6);
    });

    it('stays within 0.05 of a 80-bucket best-day grid on a longer, higher-reward day with a lock trigger inside the working range, where the cap binds hardest (the one-day swing is 9 drawdowns), at a 12 drawdown tail', () => {
        const wideDay = { ...COARSE_TOY, rrRatio: 3, tradesPerDay: 3 } as const;
        const bounded = solve(12, undefined, wideDay);
        const wide = solve(12, 80, wideDay);
        expect(bounded.reachedStateCount).toBeLessThan(wide.reachedStateCount);
        expect(Math.abs(bounded.initialValue - wide.initialValue)).toBeLessThan(
            0.05,
        );
    });

    it('sizes the cap for the coarse tail step too: with a tail step of 8 drawdowns a day close can land a whole tail step per trade from where it started, so the capped value stays within 0.5 percent of the 60 bucket grid that never clamps (3,936.37, which the pre-overflow, one-step-allowance and sized-cap solvers all give on it), instead of losing 9 percent to days the cap rounded into the overflow bucket (the one-step-allowance solver gave 3,582.10 on the capped grid)', () => {
        const overCapDay = {
            ...COARSE_TOY,
            convergenceTolerance: 1e-6,
            rrRatio: 3,
            tailCushionStepMultiple: 8,
            tradesPerDay: 3,
            winrate: 0.8,
        } as const;
        const capped = solve(40, undefined, overCapDay);
        const uncapped = solve(40, 60, overCapDay);
        expect(uncapped.initialValue).toBeCloseTo(3936.366635229252, 4);
        expect(
            Math.abs(capped.initialValue - uncapped.initialValue) /
                uncapped.initialValue,
        ).toBeLessThan(0.005);
    });

    it('fails closed when asked to track the best day with a single bucket: every positive day then lands in the overflow bucket and denies every payout, so the consistency-tracked toy earns nothing instead of ignoring its best day (PT-T1b: solved at action step 1 drawdown and a 12 drawdown tail, where the toy earns 445.76 on its default grid and exactly 0 on one bucket)', () => {
        const single = solve(12, 1, { actionStepMultiple: 1 });
        const exact = solve(12, undefined, { actionStepMultiple: 1 });
        expect(exact.initialValue).toBeGreaterThan(400);
        expect(single.initialValue).toBeLessThan(0.01 * exact.initialValue);
    });
});
