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

describe('the eval DP interpolates the day-close cushion an early daily-loss-limit lockout lands on, instead of flooring it to the cell below (N-87)', () => {
    it('a $25 loss on a $1,000 toy account (accountSize 1000, EodTrailingDrawdown 100, cushion starts at 100) breaches a $25 flat daily loss limit right away, closing day 0 at cushion 75: off the $100 cushion-step grid, a quarter of the way up from the 0 cell to the 100 cell. bucketOuterState used to floor this with floorStep(), reading day 1 as if it always started from cushion 0 (the cell below), the same cliff N-86 (WP54) fixed for the funded DP day-close transition. Before this fix, computeEvalStateValue read initialValue 0.33203125 here (identical to flooring the $25 loss branch down to the 0-cushion cell, whose own value pins at exactly 0.5 in the boundary case below); interpolating with splitOntoCushionGrid/valueOnCushionGrid like WP45 and WP54 raises it to 0.478515625, crediting the surviving $25 of cushion the DP used to throw away', () => {
        const result = computeEvalStateValue(dayCloseCushionConfig(25));

        expect(result.initialValue).toBeCloseTo(0.478515625, 12);
        expect(result.reachedStateCount).toBe(8);
    });

    it('a $100 loss on the same toy account breaches its $100 flat daily loss limit right away, closing day 0 exactly on the 0-cushion grid cell (no fractional remainder to interpolate): pins the same initialValue 0.5 whether or not the day-close cushion is interpolated, so the N-87 fix leaves an already-on-grid day close untouched', () => {
        const result = computeEvalStateValue(dayCloseCushionConfig(100));

        expect(result.initialValue).toBeCloseTo(0.5, 12);
        expect(result.reachedStateCount).toBe(6);
    });
});
