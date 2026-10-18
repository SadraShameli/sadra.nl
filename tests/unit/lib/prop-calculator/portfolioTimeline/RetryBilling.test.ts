import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    DailyLossLimitKind,
    type DatedCharge,
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
import {
    type CardResult,
    runAccountTimeline,
    runEvalToFundedCycle,
    simulatePortfolioTimeline,
} from '~/lib/prop-calculator/portfolioTimeline';
import { mulberry32, type Rng } from '~/lib/prop-calculator/rng';
import {
    assertNonNegativeSafeInteger,
    type EvalWithRetriesResult,
} from '~/lib/prop-calculator/simulator';

import { scriptedRng } from '../scriptedRng';

const EVAL_FEE = 30;
const MONTHLY = 100;
const ACTIVATION = 50;
const RISK_PER_TRADE = 100;
const ATTEMPTS_IN_BUDGET = 25;
const LOSING_DRAW = 0.9;
const WINNING_DRAW = 0.1;

interface SubscriptionPlanOptions {
    activation?: number;
    bustDay: number;
    evalFee?: number;
    maxEvalTradingDays?: number;
    monthlySubscription?: number;
    profitTarget?: number;
    reset: number;
    retry?: RetryKind;
}

function runCard(
    plan: Plan,
    rng: Rng,
    winrate: number,
    cardDayBudget: number,
    maxFundedDays = cardDayBudget,
) {
    const policy = flatDayPolicy(
        RISK_PER_TRADE,
        1,
        {
            kind: DayStopRuleKind.None,
        },
        PolicySizing.ContractCapped,
    );
    return runEvalToFundedCycle({
        cardDayBudget,
        commission: dollars(0),
        discounts: undefined,
        evalDayPolicy: policy,
        fundedDayPolicy: policy,
        maxEvalDays: 150,
        maxFundedDays,
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
            monthlySubscription: dollars(
                options.monthlySubscription ?? MONTHLY,
            ),
            oneTimeEval: dollars(options.evalFee ?? EVAL_FEE),
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
    it('in a 250-day budget, bills 25 busted 10-day re-buy attempts at 25 * ($30 + $100) = $3,250, not the 250-day renewal chain plus a month per re-buy ($4,350)', () => {
        const card = runCard(
            subscriptionPlan({
                bustDay: 10,
                reset: 1000,
                retry: RetryKind.Rebuy,
            }),
            mulberry32(1),
            0,
            250,
        );

        expect(card.attemptsUsed).toBe(ATTEMPTS_IN_BUDGET);
        expect(card.evalDays).toBe(250);
        expect(card.evalCost).toBe(ATTEMPTS_IN_BUDGET * (EVAL_FEE + MONTHLY));
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
            31,
        );

        expect(card.attemptsUsed).toBe(3);
        expect(card.evalDays).toBe(31);
        expect(card.evalCost).toBe(
            EVAL_FEE + MONTHLY + 2 * (EVAL_FEE + MONTHLY) + ACTIVATION,
        );
    });

    it('keeps a reset on the continuous subscription: in a 250-day budget, 25 busted 10-day attempts bill the $30 eval, ceil(250 / 21) = 12 months and 24 resets of $40', () => {
        const card = runCard(
            subscriptionPlan({ bustDay: 10, reset: 40 }),
            mulberry32(1),
            0,
            250,
        );

        expect(card.attemptsUsed).toBe(ATTEMPTS_IN_BUDGET);
        expect(card.evalCost).toBe(EVAL_FEE + 12 * MONTHLY + 24 * 40);
    });
});

describe('T29: the cash-flow timeline retries a timed-out eval attempt like a bust', () => {
    it('retries a 5-day-capped plan whose attempts all time out until its 125-day budget is used, 25 attempts, and bills each retry', () => {
        const card = runCard(
            subscriptionPlan({
                bustDay: 100,
                maxEvalTradingDays: 5,
                reset: 40,
            }),
            mulberry32(1),
            0,
            5 * ATTEMPTS_IN_BUDGET,
        );

        expect(card.attemptsUsed).toBe(ATTEMPTS_IN_BUDGET);
        expect(card.evalDays).toBe(5 * ATTEMPTS_IN_BUDGET);
        expect(card.payouts).toEqual([]);
        expect(card.evalCost).toBe(EVAL_FEE + 6 * MONTHLY + 24 * 40);
    });
});

function runLosingTimeline(plan: Plan, dayBudget: number) {
    return runAccountTimeline({
        dayBudget,
        dayStop: { kind: DayStopRuleKind.None },
        maxEvalDays: 150,
        plan,
        riskPerTrade: RISK_PER_TRADE,
        rng: mulberry32(1),
        rrRatio: 2,
        tradesPerDay: 1,
        winrate: 0,
    });
}

describe('N-12: a card keeps retrying its eval at the retry fee past 25 failed attempts while the timeline has days left, instead of billing a fresh purchase', () => {
    const ONE_TIME_EVAL_FEE = 200;
    const CHEAP_RESET = 40;

    function oneTimeFeePlan(): Plan {
        return subscriptionPlan({
            bustDay: 10,
            evalFee: ONE_TIME_EVAL_FEE,
            monthlySubscription: 0,
            reset: CHEAP_RESET,
        });
    }

    it('a 300-day budget of 10-day busts on a one-time-fee plan bills one $200 eval and 29 resets of $40 = $1,360, not a fresh $200 eval card after attempt 25', () => {
        const timeline = runLosingTimeline(oneTimeFeePlan(), 300);

        expect(timeline.cumulativeSpend[300]).toBeCloseTo(
            ONE_TIME_EVAL_FEE + 29 * CHEAP_RESET,
            9,
        );
    });

    it('a 300-day budget of 10-day busts on a reset subscription plan keeps one continuous subscription: the $30 eval, ceil(300 / 21) = 15 months and 29 resets of $40', () => {
        const timeline = runLosingTimeline(
            subscriptionPlan({ bustDay: 10, reset: CHEAP_RESET }),
            300,
        );

        expect(timeline.cumulativeSpend[300]).toBeCloseTo(
            EVAL_FEE + 15 * MONTHLY + 29 * CHEAP_RESET,
            9,
        );
    });

    it('the portfolio timeline at a 0% pass rate prices the same chain for every account slot', () => {
        const out = simulatePortfolioTimeline({
            accounts: 2,
            dayBudget: 300,
            dayStop: { kind: DayStopRuleKind.None },
            maxEvalDays: 150,
            plan: oneTimeFeePlan(),
            riskPerTrade: RISK_PER_TRADE,
            rrRatio: 2,
            seed: 7,
            tradesPerDay: 1,
            trials: 3,
            winrate: 0,
        });

        expect(out.spendP50.at(-1)).toBeCloseTo(
            2 * (ONE_TIME_EVAL_FEE + 29 * CHEAP_RESET),
            9,
        );
        expect(out.spendP90.at(-1)).toBeCloseTo(
            2 * (ONE_TIME_EVAL_FEE + 29 * CHEAP_RESET),
            9,
        );
    });

    it('a card with a 300-day budget runs 30 attempts over 300 days and bills them as one retry chain', () => {
        const card = runCard(oneTimeFeePlan(), mulberry32(1), 0, 300);

        expect(card.attemptsUsed).toBe(30);
        expect(card.evalDays).toBe(300);
        expect(card.payouts).toEqual([]);
        expect(card.evalCost).toBe(ONE_TIME_EVAL_FEE + 29 * CHEAP_RESET);
    });

    it('a card whose budget ends exactly at attempt 25 does not start a 26th attempt', () => {
        const card = runCard(oneTimeFeePlan(), mulberry32(1), 0, 250);

        expect(card.attemptsUsed).toBe(ATTEMPTS_IN_BUDGET);
        expect(card.evalDays).toBe(250);
        expect(card.evalCost).toBe(ONE_TIME_EVAL_FEE + 24 * CHEAP_RESET);
    });

    it('a 305-day budget of 10-day busts starts a 31st attempt on day 300 that runs to day 310, so the card bills one eval and 30 resets = $1,400 over 310 eval days', () => {
        const card = runCard(oneTimeFeePlan(), mulberry32(1), 0, 305);

        expect(card.attemptsUsed).toBe(31);
        expect(card.evalDays).toBe(310);
        expect(card.evalCost).toBe(ONE_TIME_EVAL_FEE + 30 * CHEAP_RESET);
    });

    it('the timeline books each of the 30 resets on the day its failed attempt ended and spreads only the $200 eval over the 310 eval days, so day 300 already shows all 30 resets paid', () => {
        const timeline = runLosingTimeline(oneTimeFeePlan(), 305);

        expect(timeline.cumulativeSpend[300]).toBeCloseTo(
            30 * CHEAP_RESET + (ONE_TIME_EVAL_FEE * 300) / 310,
            9,
        );
        expect(timeline.cumulativeSpend[305]).toBeCloseTo(
            30 * CHEAP_RESET + (ONE_TIME_EVAL_FEE * 305) / 310,
            9,
        );
    });

    it('a card that passes on attempt 27 is billed one eval and 26 resets', () => {
        const losingAttempt = Array.from({ length: 10 }, () => LOSING_DRAW);
        const card = runCard(
            subscriptionPlan({
                bustDay: 10,
                evalFee: ONE_TIME_EVAL_FEE,
                monthlySubscription: 0,
                profitTarget: 2 * RISK_PER_TRADE,
                reset: CHEAP_RESET,
            }),
            scriptedRng(
                Array.from({ length: 26 }, () => losingAttempt).flat(),
                WINNING_DRAW,
            ),
            0.5,
            300,
        );

        expect(card.attemptsUsed).toBe(27);
        expect(card.evalDays).toBe(261);
        expect(card.evalCost).toBe(ONE_TIME_EVAL_FEE + 26 * CHEAP_RESET);
    });

    it('stops after one attempt when an attempt fails without using a day, so a zero-day eval cap cannot retry forever', () => {
        const card = runCard(
            subscriptionPlan({
                bustDay: 10,
                evalFee: ONE_TIME_EVAL_FEE,
                maxEvalTradingDays: 0,
                monthlySubscription: 0,
                reset: CHEAP_RESET,
            }),
            mulberry32(1),
            0,
            300,
        );

        expect(card.attemptsUsed).toBe(1);
        expect(card.evalDays).toBe(0);
        expect(card.evalCost).toBe(ONE_TIME_EVAL_FEE);
    });
});

describe('N-12 (WP35): the card day budget is its own option, and maxFundedDays is only the funded horizon', () => {
    const ONE_TIME_EVAL_FEE = 200;
    const CHEAP_RESET = 40;

    function oneTimeFeePlan(maxEvalTradingDays?: number): Plan {
        return subscriptionPlan({
            bustDay: 10,
            evalFee: ONE_TIME_EVAL_FEE,
            maxEvalTradingDays,
            monthlySubscription: 0,
            reset: CHEAP_RESET,
        });
    }

    it('a zero-day funded horizon with a 300-day card budget still retries 10-day busts for 300 days, 30 attempts', () => {
        const card = runCard(oneTimeFeePlan(), mulberry32(1), 0, 300, 0);

        expect(card.attemptsUsed).toBe(30);
        expect(card.evalDays).toBe(300);
        expect(card.evalCost).toBe(ONE_TIME_EVAL_FEE + 29 * CHEAP_RESET);
    });

    it('a 50-day card budget stops the retry chain at 5 attempts even when the funded horizon is 300 days', () => {
        const card = runCard(oneTimeFeePlan(), mulberry32(1), 0, 50, 300);

        expect(card.attemptsUsed).toBe(5);
        expect(card.evalDays).toBe(50);
        expect(card.evalCost).toBe(ONE_TIME_EVAL_FEE + 4 * CHEAP_RESET);
    });

    it.each([-1, 2.5, NaN, Infinity])(
        'rejects cardDayBudget %s instead of flooring or clamping it',
        (cardDayBudget) => {
            expect(() =>
                runCard(oneTimeFeePlan(), mulberry32(1), 0, cardDayBudget, 10),
            ).toThrow(/cardDayBudget must be a non-negative safe integer/);
        },
    );

    it('returns one retry charge per reset, dated on the day each failed attempt ended', () => {
        const card = runCard(oneTimeFeePlan(), mulberry32(1), 0, 30);

        expect(card.evalRetryCharges).toStrictEqual([
            { dayOffset: 10, fee: CHEAP_RESET },
            { dayOffset: 20, fee: CHEAP_RESET },
        ]);
    });

    it('books each reset on the day it is paid: day 9 has only the spread eval fee, day 10 adds the first $40 reset, day 20 the second', () => {
        const timeline = runLosingTimeline(oneTimeFeePlan(), 30);

        expect(timeline.cumulativeSpend[9]).toBeCloseTo(
            (ONE_TIME_EVAL_FEE * 9) / 30,
            9,
        );
        expect(timeline.cumulativeSpend[10]).toBeCloseTo(
            (ONE_TIME_EVAL_FEE * 10) / 30 + CHEAP_RESET,
            9,
        );
        expect(timeline.cumulativeSpend[20]).toBeCloseTo(
            (ONE_TIME_EVAL_FEE * 20) / 30 + 2 * CHEAP_RESET,
            9,
        );
        expect(timeline.cumulativeSpend[30]).toBeCloseTo(
            ONE_TIME_EVAL_FEE + 2 * CHEAP_RESET,
            9,
        );
    });

    it('fails loud when a card uses no trading days, instead of buying up to 2,000 fresh cards that record no spend', () => {
        expect(() => runLosingTimeline(oneTimeFeePlan(0), 300)).toThrow(
            /used no trading days/,
        );
    });
});

describe('N-12 (WP35): eval retry charges and funded reset charges share one readonly dated-charge type', () => {
    it('types the retry charges of runEvalWithRetries and both charge lists of a card as readonly DatedCharge arrays', () => {
        expectTypeOf<EvalWithRetriesResult['retryCharges']>().toEqualTypeOf<
            readonly DatedCharge[]
        >();
        expectTypeOf<CardResult['evalRetryCharges']>().toEqualTypeOf<
            readonly DatedCharge[]
        >();
        expectTypeOf<CardResult['fundedResetCharges']>().toEqualTypeOf<
            readonly DatedCharge[]
        >();
    });
});

describe('N-12 (WP37a): the simulator validates non-negative day counts with one shared helper', () => {
    it.each([0, 1, 250])('accepts %s', (value) => {
        expect(() =>
            assertNonNegativeSafeInteger(value, 'cardDayBudget'),
        ).not.toThrow();
    });

    it.each([-1, 2.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
        'rejects %s and names the argument',
        (value) => {
            expect(() =>
                assertNonNegativeSafeInteger(value, 'maxFundedDays'),
            ).toThrow(
                `maxFundedDays must be a non-negative safe integer, got ${value}`,
            );
        },
    );
});
