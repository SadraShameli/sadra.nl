import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    DayStopRuleKind,
    dollars,
    FirmId,
    flatDayPolicy,
    fraction,
    MffuVariant,
    type Plan,
    RungSizing,
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
    const policy = flatDayPolicy(250, 1, { kind: DayStopRuleKind.None });
    return runEvalToFundedCycle({
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
