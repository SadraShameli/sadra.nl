import { describe, expect, it } from 'vitest';

import { lifetimeExpectedNet } from '~/lib/prop-calculator/core/LifetimeExtraction';

describe('lifetimeExpectedNet', () => {
    it('matches the closed-form fixed-point solution by hand', () => {
        const result = lifetimeExpectedNet({
            costOfOneMoreAttempt: 50,
            expectedNet: 100,
            fundedBustProbability: 0.3,
        });

        expect(result).toBeCloseTo(121.42857142857143, 10);
    });

    it('is a genuine fixed point of the renewal recursion, not just a memorized number', () => {
        const perCycle = {
            costOfOneMoreAttempt: 332,
            expectedNet: 1800,
            fundedBustProbability: 0.45,
        };

        const lifetimeNet = lifetimeExpectedNet(perCycle);

        expect(lifetimeNet).toBeCloseTo(
            perCycle.expectedNet +
                perCycle.fundedBustProbability *
                    (-perCycle.costOfOneMoreAttempt + lifetimeNet),
            10,
        );
    });

    it('collapses to the single-cycle expectedNet when the funded account never busts', () => {
        const result = lifetimeExpectedNet({
            costOfOneMoreAttempt: 332,
            expectedNet: 1800,
            fundedBustProbability: 0,
        });

        expect(result).toBe(1800);
    });

    it('does NOT equal the naive geometric-series shortcut (expectedNet / (1 - p)), which double-counts the busted cycles own payouts already folded into expectedNet', () => {
        const perCycle = {
            costOfOneMoreAttempt: 332,
            expectedNet: 1800,
            fundedBustProbability: 0.45,
        };

        const naiveWrongValue =
            perCycle.expectedNet / (1 - perCycle.fundedBustProbability);
        const correctValue = lifetimeExpectedNet(perCycle);

        expect(correctValue).not.toBeCloseTo(naiveWrongValue, 0);
        expect(correctValue).toBeLessThan(naiveWrongValue);
    });

    it('throws instead of silently dividing by zero when the funded account always busts', () => {
        expect(() =>
            lifetimeExpectedNet({
                costOfOneMoreAttempt: 332,
                expectedNet: 1800,
                fundedBustProbability: 1,
            }),
        ).toThrow(/fundedBustProbability/);
    });

    it('lowers lifetime net as the cost of a fresh attempt rises, holding everything else fixed', () => {
        const cheap = lifetimeExpectedNet({
            costOfOneMoreAttempt: 100,
            expectedNet: 500,
            fundedBustProbability: 0.6,
        });
        const expensive = lifetimeExpectedNet({
            costOfOneMoreAttempt: 1000,
            expectedNet: 500,
            fundedBustProbability: 0.6,
        });

        expect(expensive).toBeLessThan(cheap);
    });
});
