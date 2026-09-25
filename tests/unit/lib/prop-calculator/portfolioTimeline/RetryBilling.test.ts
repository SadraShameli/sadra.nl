import { describe, expect, it } from 'vitest';

import {
    DailyLossLimitKind,
    DayStopRuleKind,
    dollars,
    FirmId,
    flatDayPolicy,
    fraction,
    MffuVariant,
    type Plan,
    RetryKind,
    RungSizing,
    StaticDrawdown,
} from '~/lib/prop-calculator/core';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { runEvalToFundedCycle } from '~/lib/prop-calculator/portfolioTimeline';
import { mulberry32, type Rng } from '~/lib/prop-calculator/rng';

import { scriptedRng } from '../scriptedRng';

const EVAL_FEE = 30;
const MONTHLY = 100;
const ACTIVATION = 50;
const RISK_PER_TRADE = 100;
const MAX_EVAL_ATTEMPTS_PER_CARD = 25;
const LOSING_DRAW = 0.9;
const WINNING_DRAW = 0.1;

interface SubscriptionPlanOptions {
    activation?: number;
    bustDay: number;
    maxEvalTradingDays?: number;
    profitTarget?: number;
    reset: number;
    retry?: RetryKind;
}

function runCard(plan: Plan, rng: Rng, winrate: number) {
    const policy = flatDayPolicy(RISK_PER_TRADE, 1, {
        kind: DayStopRuleKind.None,
    });
    return runEvalToFundedCycle({
        commission: dollars(0),
        discounts: undefined,
        evalDayPolicy: policy,
        fundedDayPolicy: policy,
        maxEvalDays: 150,
        maxFundedDays: 0,
        minRetainedCushion: dollars(0),
        payoutRequestSize: undefined,
        plan,
        positionSizing: null,
        rng,
        rrRatio: 2,
        rungSizing: RungSizing.CapToCushion,
        winrate: fraction(winrate),
    });
}

function subscriptionPlan(options: SubscriptionPlanOptions): Plan {
    const base = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!base) throw new Error('MFF Rapid EOD 50K plan not found');
    return base.withOverrides({
        accountSize: dollars(50_000),
        consistency: null,
        contractLimits: undefined,
        drawdown: new StaticDrawdown({
            amount: dollars(RISK_PER_TRADE * options.bustDay),
        }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        evalMaxConsecutiveIdleDays: null,
        fees: {
            activation: dollars(options.activation ?? 0),
            monthlySubscription: dollars(MONTHLY),
            oneTimeEval: dollars(EVAL_FEE),
            reset: dollars(options.reset),
            retry: options.retry,
        },
        isInstantFunded: false,
        maxEvalTradingDays: options.maxEvalTradingDays,
        minTradingDays: 0,
        profitTarget: dollars(options.profitTarget ?? 3000),
    });
}

describe('N-60: the cash-flow timeline bills a re-buy as a new account (T10)', () => {
    it('bills 25 busted 10-day re-buy attempts at 25 * ($30 + $100) = $3,250, not the 250-day renewal chain plus a month per re-buy ($4,350)', () => {
        const card = runCard(
            subscriptionPlan({
                bustDay: 10,
                reset: 1000,
                retry: RetryKind.Rebuy,
            }),
            mulberry32(1),
            0,
        );

        expect(card.attemptsUsed).toBe(MAX_EVAL_ATTEMPTS_PER_CARD);
        expect(card.evalDays).toBe(250);
        expect(card.evalCost).toBe(
            MAX_EVAL_ATTEMPTS_PER_CARD * (EVAL_FEE + MONTHLY),
        );
    });

    it('bills a passing card after two 15-day re-buys as three accounts each inside its first month plus the activation: $30 + $100 + 2 * $130 + $50 = $440, not the 31-day chain ($540)', () => {
        const losingAttempt = Array.from({ length: 15 }, () => LOSING_DRAW);
        const card = runCard(
            subscriptionPlan({
                activation: ACTIVATION,
                bustDay: 15,
                profitTarget: 2 * RISK_PER_TRADE,
                reset: 1000,
                retry: RetryKind.Rebuy,
            }),
            scriptedRng([...losingAttempt, ...losingAttempt], WINNING_DRAW),
            0.5,
        );

        expect(card.attemptsUsed).toBe(3);
        expect(card.evalDays).toBe(31);
        expect(card.evalCost).toBe(
            EVAL_FEE + MONTHLY + 2 * (EVAL_FEE + MONTHLY) + ACTIVATION,
        );
    });

    it('keeps a reset on the continuous subscription: 25 busted 10-day attempts bill the $30 eval, ceil(250 / 21) = 12 months and 24 resets of $40', () => {
        const card = runCard(
            subscriptionPlan({ bustDay: 10, reset: 40 }),
            mulberry32(1),
            0,
        );

        expect(card.attemptsUsed).toBe(MAX_EVAL_ATTEMPTS_PER_CARD);
        expect(card.evalCost).toBe(EVAL_FEE + 12 * MONTHLY + 24 * 40);
    });
});

describe('T29: the cash-flow timeline retries a timed-out eval attempt like a bust', () => {
    it('uses every one of its 25 attempts on a 5-day-capped plan whose attempts all time out, and bills each retry', () => {
        const card = runCard(
            subscriptionPlan({
                bustDay: 100,
                maxEvalTradingDays: 5,
                reset: 40,
            }),
            mulberry32(1),
            0,
        );

        expect(card.attemptsUsed).toBe(MAX_EVAL_ATTEMPTS_PER_CARD);
        expect(card.evalDays).toBe(5 * MAX_EVAL_ATTEMPTS_PER_CARD);
        expect(card.payouts).toEqual([]);
        expect(card.evalCost).toBe(EVAL_FEE + 6 * MONTHLY + 24 * 40);
    });
});
