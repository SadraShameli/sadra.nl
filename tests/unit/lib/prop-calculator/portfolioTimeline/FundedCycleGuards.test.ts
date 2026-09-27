import { describe, expect, expectTypeOf, it } from 'vitest';

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
    RungSizing,
    StaticDrawdown,
} from '~/lib/prop-calculator/core';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import {
    type CardResult,
    runEvalToFundedCycle,
} from '~/lib/prop-calculator/portfolioTimeline';
import { mulberry32 } from '~/lib/prop-calculator/rng';

function rapidEod(): Plan {
    const plan = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFF Rapid EOD 50K plan not found');
    return plan;
}

function runCard(maxFundedDays: number): CardResult {
    const policy = flatDayPolicy(
        250,
        1,
        { kind: DayStopRuleKind.None },
        PolicySizing.ContractCapped,
    );
    return runEvalToFundedCycle({
        cardDayBudget: 60,
        commission: dollars(0),
        discounts: undefined,
        evalDayPolicy: policy,
        fundedDayPolicy: policy,
        maxEvalDays: 60,
        maxFundedDays,
        minRetainedCushion: dollars(0),
        payoutRequestSize: undefined,
        plan: rapidEod(),
        positionSizing: null,
        rng: mulberry32(3),
        rrRatio: 2,
        rungSizing: RungSizing.CapToCushion,
        winrate: fraction(1),
    });
}

describe('N-13 deferred clamp: runEvalToFundedCycle rejects a funded horizon that is not a whole number of days', () => {
    it.each([-1, 2.5, NaN, Infinity])(
        'rejects maxFundedDays %s instead of flooring or clamping it',
        (maxFundedDays) => {
            expect(() => runCard(maxFundedDays)).toThrow(
                /maxFundedDays must be a non-negative safe integer/,
            );
        },
    );

    it('accepts a zero-day funded horizon, which ends the card at the pass', () => {
        const card = runCard(0);

        expect(card.totalDays).toBe(card.evalDays);
        expect(card.payouts).toStrictEqual([]);
    });

    it('runs a funded phase no longer than the horizon it is given', () => {
        const card = runCard(20);
        const fundedDays = card.totalDays - card.evalDays;

        expect(fundedDays).toBeGreaterThan(0);
        expect(fundedDays).toBeLessThanOrEqual(20);
    });
});

function neverPassingPlan(maxEvalTradingDays: number): Plan {
    return rapidEod().withOverrides({
        accountSize: dollars(1_000_000),
        consistency: null,
        contractLimits: undefined,
        drawdown: new StaticDrawdown({ amount: dollars(1_000_000) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        evalMaxConsecutiveIdleDays: null,
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(100),
            reset: dollars(40),
        },
        isInstantFunded: false,
        maxEvalTradingDays,
        minTradingDays: 0,
        profitTarget: dollars(1_000_000),
    });
}

function runNeverPassingCard(
    overrides: Partial<Parameters<typeof runEvalToFundedCycle>[0]> = {},
): CardResult {
    const policy = flatDayPolicy(
        50,
        1,
        { kind: DayStopRuleKind.None },
        PolicySizing.ContractCapped,
    );
    return runEvalToFundedCycle({
        cardDayBudget: 100,
        commission: dollars(0),
        discounts: undefined,
        evalDayPolicy: policy,
        fundedDayPolicy: policy,
        maxEvalDays: 200,
        maxFundedDays: 0,
        minRetainedCushion: dollars(0),
        payoutRequestSize: undefined,
        plan: neverPassingPlan(10),
        positionSizing: null,
        rng: mulberry32(1),
        rrRatio: 2,
        rungSizing: RungSizing.CapToCushion,
        winrate: fraction(0.5),
        ...overrides,
    });
}

describe('PT-55b: runEvalToFundedCycle threads an optional retry affordability check', () => {
    it('with no affordability check, retries run until the card day budget is spent', () => {
        const card = runNeverPassingCard();

        expect(card.attemptsUsed).toBe(10);
        expect(card.totalDays).toBe(100);
    });

    it('an affordability check that refuses the second retry stops the card there, without drawing a third attempt', () => {
        let calls = 0;
        const card = runNeverPassingCard({
            retryAffordabilityCheck: () => {
                calls += 1;
                return calls < 2;
            },
        });

        expect(card.attemptsUsed).toBe(2);
        expect(card.totalDays).toBe(20);
        expect(card.evalRetryCharges).toStrictEqual([
            { dayOffset: 10, fee: 40 },
        ]);
    });
});

describe('PT-55b: runEvalToFundedCycle threads an optional fundedRrRatio distinct from the eval rrRatio', () => {
    it('changes the funded phase while the eval phase (same seed, same rrRatio) stays identical', () => {
        const baseline = runCard(15);
        const withFundedOverride = runEvalToFundedCycle({
            cardDayBudget: 60,
            commission: dollars(0),
            discounts: undefined,
            evalDayPolicy: flatDayPolicy(
                250,
                1,
                { kind: DayStopRuleKind.None },
                PolicySizing.ContractCapped,
            ),
            fundedDayPolicy: flatDayPolicy(
                250,
                1,
                { kind: DayStopRuleKind.None },
                PolicySizing.ContractCapped,
            ),
            fundedRrRatio: 6,
            maxEvalDays: 60,
            maxFundedDays: 15,
            minRetainedCushion: dollars(0),
            payoutRequestSize: undefined,
            plan: rapidEod(),
            positionSizing: null,
            rng: mulberry32(3),
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            winrate: fraction(1),
        });

        expect(withFundedOverride.evalDays).toBe(baseline.evalDays);
        expect(withFundedOverride.evalCost).toBeCloseTo(baseline.evalCost, 9);
        expect(withFundedOverride.payouts).not.toStrictEqual(
            baseline.payouts,
        );
    });
});

describe('WP18k handoff: CardResult names the eval-phase spend evalCost, since funded reset charges are carried separately', () => {
    it('exposes evalCost next to fundedResetCharges and no totalCost field', () => {
        expectTypeOf<CardResult>().toHaveProperty('evalCost');
        expectTypeOf<CardResult>().not.toHaveProperty('totalCost');

        const card = runCard(0);

        expect(Object.keys(card)).toContain('evalCost');
        expect(Object.keys(card)).not.toContain('totalCost');
        expect(card.evalCost).toBeGreaterThan(0);
    });
});
