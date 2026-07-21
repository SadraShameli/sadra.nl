import { describe, expect, it } from 'vitest';

import { PlateCalculator } from '~/lib/lifting/math/plate-calculator';

const STANDARD_PLATES = [20, 15, 10, 5, 2.5, 1.25];

describe('PlateCalculator', () => {
    it('loads 60 kg cleanly with a 20 kg bar', () => {
        const calc = new PlateCalculator(20, STANDARD_PLATES);
        const load = calc.load(60);
        expect(load.perSide).toEqual([20]);
        expect(load.remainderKg).toBe(0);
        expect(load.totalLoadedKg).toBe(60);
    });

    it('loads 100 kg as 20+20 per side with a 20 kg bar', () => {
        const calc = new PlateCalculator(20, STANDARD_PLATES);
        const load = calc.load(100);
        expect(load.perSide).toEqual([20, 20]);
        expect(load.remainderKg).toBe(0);
    });

    it('loads 102.5 kg using a 1.25 fractional plate', () => {
        const calc = new PlateCalculator(20, STANDARD_PLATES);
        const load = calc.load(102.5);
        expect(load.perSide).toEqual([20, 20, 1.25]);
        expect(load.remainderKg).toBeCloseTo(0, 6);
    });

    it('returns no plates when the target equals the bar', () => {
        const calc = new PlateCalculator(20, STANDARD_PLATES);
        const load = calc.load(20);
        expect(load.perSide).toEqual([]);
        expect(load.remainderKg).toBe(0);
        expect(load.totalLoadedKg).toBe(20);
    });

    it('reports remainder when target is below the bar weight', () => {
        const calc = new PlateCalculator(20, STANDARD_PLATES);
        const load = calc.load(10);
        expect(load.perSide).toEqual([]);
        expect(load.remainderKg).toBe(10);
    });

    it('reports remainder for impossible loads given available plates', () => {
        const calc = new PlateCalculator(20, [20]);
        const load = calc.load(45);
        expect(load.perSide).toEqual([]);
        expect(load.remainderKg).toBeCloseTo(25, 6);
    });

    it('greedily prefers larger plates', () => {
        const calc = new PlateCalculator(20, STANDARD_PLATES);
        const load = calc.load(80);
        expect(load.perSide).toEqual([20, 10]);
    });

    it('handles fractional bar weights', () => {
        const calc = new PlateCalculator(15, STANDARD_PLATES);
        const load = calc.load(55);
        expect(load.perSide).toEqual([20]);
        expect(load.remainderKg).toBe(0);
    });

    it('ignores non-finite or negative plates in the input', () => {
        const calc = new PlateCalculator(20, [20, -5, NaN, 10]);
        expect(calc.plates).toEqual([20, 10]);
    });
});
