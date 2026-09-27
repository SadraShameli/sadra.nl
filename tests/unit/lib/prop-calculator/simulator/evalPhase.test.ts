import { describe, expect, it, vi } from 'vitest';

import {
    DailyLossLimitKind,
    DayStopRuleKind,
    dollars,
    FirmId,
    flatDayPolicy,
    fraction,
    MffuVariant,
    type Plan,
    PolicySizing,
    RetryKind,
    RungSizing,
    StaticDrawdown,
} from '~/lib/prop-calculator/core';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { mulberry32 } from '~/lib/prop-calculator/rng';
import {
    runEvalWithRetries,
    type SimInputs,
    simulate,
    TradeTotals,
} from '~/lib/prop-calculator/simulator';

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

function retryOptions(plan: Plan, maxEvalDays: number) {
    return {
        commission: dollars(0),
        dayPolicy: flatDayPolicy(
            RISK_PER_TRADE,
            1,
            {
                kind: DayStopRuleKind.None,
            },
            PolicySizing.ContractCapped,
        ),
        maxEvalDays,
        plan,
        positionSizing: null,
        rng: mulberry32(1),
        rrRatio: 2,
        rungSizing: RungSizing.CapToCushion,
        shouldCaptureEquity: false,
        totals: new TradeTotals(),
        winrate: fraction(0.5),
    };
}

describe('N-12 (WP35): runEvalWithRetries retries within a total eval-day budget', () => {
    it('with a 25-day budget and no attempt cap, retries 10-day timeouts while fewer than 25 days are used: 3 attempts over 30 days and 2 retry fees', () => {
        const result = runEvalWithRetries({
            ...retryOptions(neverFinishingPlan(), 10),
            maxTotalEvalDays: 25,
        });

        expect(result.attemptsUsed).toBe(3);
        expect(result.daysElapsed).toBe(30);
        expect(result.failedAttemptDays).toStrictEqual([10, 10, 10]);
        expect(result.resetFeesPaid).toBe(2 * RESET_FEE);
        expect(result.terminalOutcome).toBe('timed-out');
    });

    it('does not start another attempt once the days used reach the budget exactly', () => {
        const result = runEvalWithRetries({
            ...retryOptions(neverFinishingPlan(), 10),
            maxTotalEvalDays: 20,
        });

        expect(result.attemptsUsed).toBe(2);
        expect(result.daysElapsed).toBe(20);
        expect(result.resetFeesPaid).toBe(RESET_FEE);
    });

    it('stops at whichever of the attempt cap and the day budget comes first', () => {
        const attemptCapFirst = runEvalWithRetries({
            ...retryOptions(neverFinishingPlan(), 10),
            maxAttempts: 2,
            maxTotalEvalDays: 100,
        });
        const dayBudgetFirst = runEvalWithRetries({
            ...retryOptions(neverFinishingPlan(), 10),
            maxAttempts: 9,
            maxTotalEvalDays: 30,
        });

        expect(attemptCapFirst.attemptsUsed).toBe(2);
        expect(dayBudgetFirst.attemptsUsed).toBe(3);
    });

    it('stops after one attempt when an attempt fails without using a day, so a zero-day eval cap cannot retry forever under a day budget', () => {
        const result = runEvalWithRetries({
            ...retryOptions(neverFinishingPlan({ maxEvalTradingDays: 0 }), 10),
            maxTotalEvalDays: 100,
        });

        expect(result.attemptsUsed).toBe(1);
        expect(result.daysElapsed).toBe(0);
        expect(result.resetFeesPaid).toBe(0);
    });

    it('keeps the attempt-cap behaviour unchanged when no budget is given: zero-day attempts still run to maxAttempts', () => {
        const result = runEvalWithRetries({
            ...retryOptions(neverFinishingPlan({ maxEvalTradingDays: 0 }), 10),
            maxAttempts: 3,
        });

        expect(result.attemptsUsed).toBe(3);
        expect(result.resetFeesPaid).toBe(2 * RESET_FEE);
    });

    it('records each retry fee on the day the failed attempt ended, one charge per retry and none for the last attempt', () => {
        const result = runEvalWithRetries({
            ...retryOptions(neverFinishingPlan(), 10),
            maxTotalEvalDays: 25,
        });

        expect(result.retryCharges).toStrictEqual([
            { dayOffset: 10, fee: RESET_FEE },
            { dayOffset: 20, fee: RESET_FEE },
        ]);
    });
});

describe('PT-55b: runEvalWithRetries stops before drawing a retry the affordability check refuses', () => {
    it('a retry the affordability check refuses ends the run at the failed attempt, without drawing another attempt', () => {
        const check = vi.fn((): boolean => false);
        const result = runEvalWithRetries({
            ...retryOptions(neverFinishingPlan(), 10),
            maxTotalEvalDays: 100,
            retryAffordabilityCheck: check,
        });

        expect(result.attemptsUsed).toBe(1);
        expect(result.daysElapsed).toBe(10);
        expect(result.resetFeesPaid).toBe(0);
        expect(result.retryCharges).toStrictEqual([]);
        expect(result.terminalOutcome).toBe('timed-out');
        expect(check).toHaveBeenCalledTimes(1);
        expect(check).toHaveBeenCalledWith(RESET_FEE, 10);
    });

    it('stops right after the retry the affordability check refuses, one attempt short of the day-budget limit', () => {
        let calls = 0;
        const check = vi.fn((): boolean => {
            calls += 1;
            return calls < 2;
        });
        const result = runEvalWithRetries({
            ...retryOptions(neverFinishingPlan(), 10),
            maxTotalEvalDays: 100,
            retryAffordabilityCheck: check,
        });

        expect(result.attemptsUsed).toBe(2);
        expect(result.daysElapsed).toBe(20);
        expect(result.resetFeesPaid).toBe(RESET_FEE);
        expect(result.retryCharges).toStrictEqual([
            { dayOffset: 10, fee: RESET_FEE },
        ]);
        expect(result.terminalOutcome).toBe('timed-out');
    });

    it('leaves the retry loop unbounded by affordability when no check is given', () => {
        const result = runEvalWithRetries({
            ...retryOptions(neverFinishingPlan(), 10),
            maxTotalEvalDays: 25,
        });

        expect(result.attemptsUsed).toBe(3);
        expect(result.resetFeesPaid).toBe(2 * RESET_FEE);
    });
});

describe('N-12 (WP35): runEvalWithRetries fails loud without a retry bound', () => {
    it('throws when neither maxAttempts nor maxTotalEvalDays is given, instead of retrying a losing eval forever', () => {
        const unbounded = retryOptions(neverFinishingPlan(), 10) as Parameters<
            typeof runEvalWithRetries
        >[0];

        expect(() => runEvalWithRetries(unbounded)).toThrow(
            /needs maxAttempts or maxTotalEvalDays/,
        );
    });
});
