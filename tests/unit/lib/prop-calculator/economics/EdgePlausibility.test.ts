import { describe, expect, it } from 'vitest';

import { fraction } from '~/lib/prop-calculator/core';
import {
    EconomicsDisclosure,
    EconomicsReason,
    edgePlausibility,
    expectancyPerTradeR,
    fullKellyFraction,
    kellyGrowthPerTrade,
    PlausibilityLevel,
    type PlausibilityThresholds,
} from '~/lib/prop-calculator/economics';

const plannerThresholds: PlausibilityThresholds = {
    strongMaxExpectancyR: 0.35,
    typicalMaxExpectancyR: 0.3,
};

function levelOf(winrate: number, rrRatio: number): null | PlausibilityLevel {
    return (
        edgePlausibility({
            rrRatio,
            thresholds: plannerThresholds,
            winrate: fraction(winrate),
        }).value?.level ?? null
    );
}

describe('edgePlausibility', () => {
    it('calls 70% at 1:1 (0.40R) Implausible', () => {
        expect(levelOf(0.7, 1)).toBe(PlausibilityLevel.Implausible);
    });

    it('calls 40% at 1:2 (0.20R) and 52% at 1:1 (0.04R) Typical', () => {
        expect(levelOf(0.4, 2)).toBe(PlausibilityLevel.Typical);
        expect(levelOf(0.52, 1)).toBe(PlausibilityLevel.Typical);
    });

    it('calls an expectancy between the two thresholds Strong', () => {
        expect(levelOf(0.66, 1)).toBe(PlausibilityLevel.Strong);
    });

    it('keeps an expectancy exactly on a threshold in the lower level', () => {
        expect(levelOf(0.65, 1)).toBe(PlausibilityLevel.Typical);
        expect(levelOf(0.675, 1)).toBe(PlausibilityLevel.Strong);
    });

    it('calls negative and zero expectancy NoEdge', () => {
        expect(levelOf(0.3, 1)).toBe(PlausibilityLevel.NoEdge);
        expect(levelOf(0.5, 1)).toBe(PlausibilityLevel.NoEdge);
    });

    it('reads expectancy and Kelly from EdgeMath', () => {
        const result = edgePlausibility({
            rrRatio: 1,
            thresholds: plannerThresholds,
            winrate: fraction(0.7),
        }).value;
        expect(result?.expectancyR).toBe(
            expectancyPerTradeR(fraction(0.7), 1).value,
        );
        expect(result?.fullKelly).toBe(
            fullKellyFraction(fraction(0.7), 1).value,
        );
        expect(result?.kellyGrowthPerTrade).toEqual(
            kellyGrowthPerTrade(fraction(0.7), 1),
        );
    });

    it('carries the Kelly sizing disclosure with the Kelly figures it returns', () => {
        expect(
            edgePlausibility({
                rrRatio: 2,
                thresholds: plannerThresholds,
                winrate: fraction(0.4),
            }).disclosures,
        ).toContain(EconomicsDisclosure.KellyNotPropSizing);
    });

    it('uses the thresholds passed in, never its own', () => {
        const result = edgePlausibility({
            rrRatio: 2,
            thresholds: {
                strongMaxExpectancyR: 0.15,
                typicalMaxExpectancyR: 0.1,
            },
            winrate: fraction(0.4),
        }).value;
        expect(result?.level).toBe(PlausibilityLevel.Implausible);
    });

    it.each([
        { strongMaxExpectancyR: 0.2, typicalMaxExpectancyR: 0.3 },
        { strongMaxExpectancyR: NaN, typicalMaxExpectancyR: 0.3 },
        { strongMaxExpectancyR: 0.35, typicalMaxExpectancyR: -0.1 },
    ])('refuses thresholds %o', (thresholds) => {
        expect(
            edgePlausibility({
                rrRatio: 1,
                thresholds,
                winrate: fraction(0.6),
            }).reason,
        ).toBe(EconomicsReason.InvalidInput);
    });

    it('refuses an invalid winrate', () => {
        expect(
            edgePlausibility({
                rrRatio: 1,
                thresholds: plannerThresholds,
                winrate: fraction(1.4),
            }).reason,
        ).toBe(EconomicsReason.InvalidInput);
    });
});
