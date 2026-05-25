import { describe, expect, it } from 'vitest';

import {
    BrzyckiFormula,
    EpleyFormula,
    LombardiFormula,
    OneRepMaxCalculator,
} from '~/lib/lifting/math/one-rep-max';

const calc = new OneRepMaxCalculator();

describe('EpleyFormula', () => {
    const f = new EpleyFormula();

    it('returns the weight when reps == 1', () => {
        expect(f.estimate(100, 1)).toBe(100);
    });

    it('matches the known Epley constant for 5 reps', () => {
        expect(f.estimate(100, 5)).toBeCloseTo(116.667, 2);
    });
});

describe('BrzyckiFormula', () => {
    const f = new BrzyckiFormula();

    it('returns the weight when reps == 1', () => {
        expect(f.estimate(100, 1)).toBe(100);
    });

    it('returns the weight when reps >= 37 to avoid divide-by-zero blowup', () => {
        expect(f.estimate(100, 37)).toBe(100);
        expect(f.estimate(100, 50)).toBe(100);
    });

    it('matches the known Brzycki formula at 5 reps', () => {
        expect(f.estimate(100, 5)).toBeCloseTo(112.5, 2);
    });
});

describe('LombardiFormula', () => {
    const f = new LombardiFormula();

    it('returns the weight when reps == 1', () => {
        expect(f.estimate(100, 1)).toBe(100);
    });

    it('matches the known Lombardi value at 5 reps', () => {
        expect(f.estimate(100, 5)).toBeCloseTo(100 * Math.pow(5, 0.1), 4);
    });
});

describe('OneRepMaxCalculator.estimate', () => {
    it('returns 0 for non-positive or non-finite weight', () => {
        expect(calc.estimate(0, 5)).toBe(0);
        expect(calc.estimate(-100, 5)).toBe(0);
        expect(calc.estimate(Number.NaN, 5)).toBe(0);
    });

    it('returns 0 for non-positive reps', () => {
        expect(calc.estimate(100, 0)).toBe(0);
        expect(calc.estimate(100, -1)).toBe(0);
    });

    it('estimates up to 20 reps and zeroes anything higher', () => {
        expect(calc.estimate(100, 13)).toBeGreaterThan(100);
        expect(calc.estimate(100, 20)).toBeGreaterThan(100);
        expect(calc.estimate(100, 21)).toBe(0);
        expect(calc.estimate(100, 30)).toBe(0);
    });

    it('round-trips: weightFor(estimate(w, r), r) is within 1.5 kg of w', () => {
        for (const reps of [3, 5, 8, 10, 15]) {
            const e1rm = calc.estimate(100, reps);
            const recovered = calc.weightFor(e1rm, reps);
            expect(Math.abs(recovered - 100)).toBeLessThan(1.5);
        }
    });

    it('returns the weight at 1 rep', () => {
        expect(calc.estimate(140, 1)).toBe(140);
    });

    it('averages the three formulas at typical rep ranges', () => {
        const value = calc.estimate(100, 5);
        const expected =
            (new EpleyFormula().estimate(100, 5) +
                new BrzyckiFormula().estimate(100, 5) +
                new LombardiFormula().estimate(100, 5)) /
            3;
        expect(value).toBeCloseTo(expected, 6);
    });
});

describe('OneRepMaxCalculator.weightFor', () => {
    it('returns 0 for invalid 1RM', () => {
        expect(calc.weightFor(0, 5)).toBe(0);
        expect(calc.weightFor(-100, 5)).toBe(0);
    });

    it('returns the 1RM at 1 rep', () => {
        expect(calc.weightFor(140, 1)).toBe(140);
    });

    it('returns a lower weight as reps increase', () => {
        const w5 = calc.weightFor(140, 5);
        const w8 = calc.weightFor(140, 8);
        expect(w5).toBeGreaterThan(w8);
    });

    it('returns 0 when reps exceeds the reasonable cap', () => {
        expect(calc.weightFor(140, 21)).toBe(0);
    });
});
