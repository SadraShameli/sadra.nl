import { describe, expect, it } from 'vitest';

import {
    computeEvalStateValue,
    DailyLossLimitKind,
    dollars,
    type EvalStateValueConfig,
    fraction,
} from '~/lib/prop-calculator/core';

import { toyPlan } from '../evalStateValueToy';

function dayCloseCushionConfig(
    actionAndDllDollars: number,
): EvalStateValueConfig {
    const plan = toyPlan(50).withOverrides({
        evalDailyLossLimit: {
            amount: dollars(actionAndDllDollars),
            kind: DailyLossLimitKind.Flat,
        },
    });
    return {
        actionStepDollars: actionAndDllDollars,
        cushionStepDollars: 100,
        maxActionDollars: actionAndDllDollars,
        maxEvalDays: 2,
        plan,
        rrRatio: 2,
        tradesPerDay: 2,
        winrate: fraction(0.5),
    };
}

describe('the eval DP values the day-close cushion an early daily-loss-limit lockout lands on exactly, never floored to the cell below and never interpolated (N-87, N-89)', () => {
    it('a $25 loss on a $1,000 toy account (EodTrailingDrawdown 100, cushion starts at 100) breaches a $25 flat daily loss limit right away and closes day 0 at cushion 75, off the $100 cushion step: day 1 is solved from cushion 75 itself, where two $25 wins at 1:2 reach profit 75 against the $50 target with probability 0.25, and a $25 win on day 0 closes at profit $50, an exact pass, so day 0 is worth 0.5 * 1 + 0.5 * 0.25 = 0.625 (flooring to cushion 0 gave 0.33203125, a blend of the 0 and 100 nodes gave 0.478515625 then 0.6875)', () => {
        const result = computeEvalStateValue(dayCloseCushionConfig(25));

        expect(result.initialValue).toBeCloseTo(0.625, 12);
        expect(result.reachedStateCount).toBe(12);
    });

    it('a $100 loss on the same toy account breaches its $100 flat daily loss limit right away, closing day 0 exactly on the 0-cushion cell (a bust): pins initialValue 0.5 and a reached count of 3, because the DP solves only the day starts a within-day search reaches', () => {
        const result = computeEvalStateValue(dayCloseCushionConfig(100));

        expect(result.initialValue).toBeCloseTo(0.5, 12);
        expect(result.reachedStateCount).toBe(3);
    });
});
