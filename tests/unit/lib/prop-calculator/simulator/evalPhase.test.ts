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
import { type SimInputs, simulate } from '~/lib/prop-calculator/simulator';

const EVAL_FEE = 100;
const RESET_FEE = 40;
const RISK_PER_TRADE = 50;

function neverFinishingPlan(
    options: { maxEvalTradingDays?: number; retry?: RetryKind } = {},
): Plan {
    return rapidEodPlan().withOverrides({
        accountSize: dollars(1_000_000),
        consistency: null,
        contractLimits: undefined,
        drawdown: new StaticDrawdown({ amount: dollars(1_000_000) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        evalMaxConsecutiveIdleDays: null,
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(EVAL_FEE),
            reset: dollars(RESET_FEE),
            retry: options.retry,
        },
        isInstantFunded: false,
        maxEvalTradingDays: options.maxEvalTradingDays,
        minTradingDays: 0,
        profitTarget: dollars(1_000_000),
    });
}

function rapidEodPlan(): Plan {
    const found = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!found) throw new Error('MFF Rapid EOD 50K plan not found');
    return found;
}

function timeoutInputs(overrides: Partial<SimInputs>): SimInputs {
    return {
        fundedHorizonDays: 5,
        maxEvalDays: 5,
        plan: neverFinishingPlan(),
        riskPerTrade: RISK_PER_TRADE,
        rrRatio: 2,
        seed: 7,
        tradesPerDay: 1,
        trials: 20,
        winrate: 0.5,
        ...overrides,
    };
}

describe('runEvalWithRetries retries a timed-out eval attempt like a bust (T29, N-61)', () => {
    it('an attempt that runs out the modeled --eval-days horizon is retried at the reset fee until maxAttempts is spent', () => {
        const out = simulate(timeoutInputs({ maxAttempts: 3 }));

        expect(out.timeoutProbability).toBe(1);
        expect(out.bustProbability).toBe(0);
        expect(out.expectedAttempts).toBe(3);
        expect(out.costBreakdown.resetFeesTotal).toBe(2 * RESET_FEE);
        expect(out.expectedTotalCost).toBe(EVAL_FEE + 2 * RESET_FEE);
    });

    it("an attempt that hits the plan's own eval day cap is retried at the re-buy price, each attempt getting the capped window", () => {
        const plan = neverFinishingPlan({
            maxEvalTradingDays: 3,
            retry: RetryKind.Rebuy,
        });
        const out = simulate(
            timeoutInputs({
                maxAttempts: 4,
                maxEvalDays: 150,
                plan,
                rebuyLagDays: 0,
            }),
        );

        expect(out.timeoutProbability).toBe(1);
        expect(out.expectedAttempts).toBe(4);
        expect(out.expectedTotalCost).toBe(4 * EVAL_FEE);
        expect(out.expectedMonthlyNet).toBeCloseTo(
            (-4 * EVAL_FEE * 21) / (4 * 3),
            9,
        );
    });

    it('with a single attempt a timeout still ends the trial as a timeout and charges no retry', () => {
        const out = simulate(timeoutInputs({ maxAttempts: 1 }));

        expect(out.timeoutProbability).toBe(1);
        expect(out.expectedAttempts).toBe(1);
        expect(out.costBreakdown.resetFeesTotal).toBe(0);
        expect(out.expectedTotalCost).toBe(EVAL_FEE);
    });
});
