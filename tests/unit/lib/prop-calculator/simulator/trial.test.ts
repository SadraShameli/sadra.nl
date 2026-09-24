import { describe, expect, it } from 'vitest';

import {
    DailyLossLimitKind,
    dollars,
    FirmId,
    MffuVariant,
    type Plan,
    RetryKind,
    StaticDrawdown,
} from '~/lib/prop-calculator/core';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { simulate } from '~/lib/prop-calculator/simulator';

const EVAL_FEE = 30;
const MONTHLY = 100;
const RISK_PER_TRADE = 100;
const MAX_ATTEMPTS = 3;

function rapidEodPlan(): Plan {
    const found = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!found) throw new Error('MFF Rapid EOD 50K plan not found');
    return found;
}

function runBusts(plan: Plan) {
    return simulate({
        fundedHorizonDays: 5,
        maxAttempts: MAX_ATTEMPTS,
        maxEvalDays: 150,
        plan,
        riskPerTrade: RISK_PER_TRADE,
        rrRatio: 2,
        seed: 3,
        tradesPerDay: 1,
        trials: 4,
        winrate: 0,
    });
}

function subscriptionBustPlan(options: {
    bustDay: number;
    reset: number;
    retry?: RetryKind;
}): Plan {
    return rapidEodPlan().withOverrides({
        accountSize: dollars(50_000),
        consistency: null,
        contractLimits: undefined,
        drawdown: new StaticDrawdown({
            amount: dollars(RISK_PER_TRADE * options.bustDay),
        }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        evalMaxConsecutiveIdleDays: null,
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(MONTHLY),
            oneTimeEval: dollars(EVAL_FEE),
            reset: dollars(options.reset),
            retry: options.retry,
        },
        isInstantFunded: false,
        maxEvalTradingDays: undefined,
        minTradingDays: 0,
    });
}

describe('subscription billing across failed eval attempts (N-60)', () => {
    it('a re-buy is a new account whose first month is in the re-buy price: three 10-day attempts bill 3 * ($30 + $100), not the renewal chain of 30 days plus a month per re-buy ($490)', () => {
        const out = runBusts(
            subscriptionBustPlan({
                bustDay: 10,
                reset: 1000,
                retry: RetryKind.Rebuy,
            }),
        );

        expect(out.bustProbability).toBe(1);
        expect(out.expectedAttempts).toBe(MAX_ATTEMPTS);
        expect(out.costBreakdown.resetFeesTotal).toBe(2 * (EVAL_FEE + MONTHLY));
        expect(out.expectedTotalCost).toBe(3 * (EVAL_FEE + MONTHLY));
    });

    it('a re-bought attempt that runs past its first month bills its own extra month: three 30-day attempts bill 3 * $30 + 6 * $100 ($690), not the 90-day chain of ceil(90 / 21) = 5 months plus a month per re-buy ($790)', () => {
        const out = runBusts(
            subscriptionBustPlan({
                bustDay: 30,
                reset: 1000,
                retry: RetryKind.Rebuy,
            }),
        );

        expect(out.expectedAttempts).toBe(MAX_ATTEMPTS);
        expect(out.expectedTotalCost).toBe(3 * EVAL_FEE + 6 * MONTHLY);
    });

    it('the cheaper re-buy path picked by price bills the same per-account months as an explicit re-buy plan', () => {
        const out = runBusts(
            subscriptionBustPlan({
                bustDay: 10,
                reset: EVAL_FEE + MONTHLY + 1,
            }),
        );

        expect(out.expectedTotalCost).toBe(3 * (EVAL_FEE + MONTHLY));
    });

    it('control, unchanged by T10: a reset keeps the same subscription running, so three 10-day attempts bill the $30 eval, ceil(30 / 21) = 2 months of the chain and two $40 resets', () => {
        const out = runBusts(subscriptionBustPlan({ bustDay: 10, reset: 40 }));

        expect(out.expectedAttempts).toBe(MAX_ATTEMPTS);
        expect(out.costBreakdown.resetFeesTotal).toBe(2 * 40);
        expect(out.expectedTotalCost).toBe(EVAL_FEE + 2 * MONTHLY + 2 * 40);
    });
});
