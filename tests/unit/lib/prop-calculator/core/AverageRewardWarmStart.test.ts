import { describe, expect, it } from 'vitest';

import {
    secantWarmStart,
    type SolvedFundedValues,
} from '~/lib/prop-calculator/core/AverageRewardSolver';

function solved(
    ratePerDay: number,
    ...stateValues: number[]
): SolvedFundedValues {
    return { ratePerDay, stateValues: Float64Array.from(stateValues) };
}

describe('the warm start of the next funded solve in the rate search (WP66a R5)', () => {
    it('starts the first solve cold, since there is nothing to warm it with', () => {
        expect(secantWarmStart([], 100)).toBeUndefined();
    });

    it('warms the second solve with the first solve values when the rate moved a little, so it does not start from zero', () => {
        const first = solved(216.6, 10, 20, 30);

        const guess = secantWarmStart([first], 240.7);

        expect(Array.from(guess ?? [])).toStrictEqual([10, 20, 30]);
        expect(guess?.buffer).not.toBe(first.stateValues.buffer);
    });

    it('leaves the second solve cold when the rate jumped by more than 25 per day, since the first values are then a poor guess', () => {
        expect(secantWarmStart([solved(0, 10, 20, 30)], 102.1)).toBeUndefined();
    });

    it('still warms the second solve at a step of exactly 25 per day', () => {
        expect(secantWarmStart([solved(100, 1)], 125)).toBeDefined();
    });

    it('extrapolates along the line of the last two solves from the third solve on', () => {
        const guess = secantWarmStart(
            [solved(100, 10, 100), solved(110, 8, 90)],
            120,
        );

        expect(Array.from(guess ?? [])).toStrictEqual([6, 80]);
    });

    it('stays cold when the last two solves have different grids', () => {
        expect(
            secantWarmStart([solved(100, 1, 2), solved(110, 1, 2, 3)], 120),
        ).toBeUndefined();
    });

    it('stays cold when the last two solves share a rate', () => {
        expect(
            secantWarmStart([solved(100, 1), solved(100, 2)], 120),
        ).toBeUndefined();
    });
});
