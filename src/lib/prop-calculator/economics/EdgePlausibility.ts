import { type Fraction0to1 } from '../core';
import {
    EconomicsDisclosure,
    EconomicsReason,
    expectancyPerTradeR,
    fullKellyFraction,
    kellyGrowthPerTrade,
    missingQuantity,
    type Quantity,
    quantityOf,
} from './EdgeMath';

const EXPECTANCY_R_TOLERANCE = 1e-9;

export enum PlausibilityLevel {
    Implausible = 'implausible',
    NoEdge = 'no-edge',
    Strong = 'strong',
    Typical = 'typical',
}

export interface EdgePlausibility {
    expectancyR: number;
    fullKelly: number;
    kellyGrowthPerTrade: Quantity<number>;
    level: PlausibilityLevel;
}

export interface EdgePlausibilityInputs {
    rrRatio: number;
    thresholds: PlausibilityThresholds;
    winrate: Fraction0to1;
}

export interface PlausibilityThresholds {
    strongMaxExpectancyR: number;
    typicalMaxExpectancyR: number;
}

export function edgePlausibility(
    inputs: EdgePlausibilityInputs,
): Quantity<EdgePlausibility> {
    const { rrRatio, thresholds, winrate } = inputs;
    const expectancy = expectancyPerTradeR(winrate, rrRatio);
    const kelly = fullKellyFraction(winrate, rrRatio);
    if (
        expectancy.value === null ||
        kelly.value === null ||
        !areThresholdsValid(thresholds)
    ) {
        return missingQuantity(EconomicsReason.InvalidInput);
    }
    return quantityOf(
        {
            expectancyR: expectancy.value,
            fullKelly: kelly.value,
            kellyGrowthPerTrade: kellyGrowthPerTrade(winrate, rrRatio),
            level: levelOf(expectancy.value, thresholds),
        },
        [EconomicsDisclosure.KellyNotPropSizing],
    );
}

function areThresholdsValid(thresholds: PlausibilityThresholds): boolean {
    const { strongMaxExpectancyR, typicalMaxExpectancyR } = thresholds;
    return (
        Number.isFinite(typicalMaxExpectancyR) &&
        Number.isFinite(strongMaxExpectancyR) &&
        typicalMaxExpectancyR > 0 &&
        strongMaxExpectancyR >= typicalMaxExpectancyR
    );
}

function levelOf(
    expectancyR: number,
    thresholds: PlausibilityThresholds,
): PlausibilityLevel {
    if (expectancyR <= EXPECTANCY_R_TOLERANCE) return PlausibilityLevel.NoEdge;
    if (
        expectancyR <=
        thresholds.typicalMaxExpectancyR + EXPECTANCY_R_TOLERANCE
    ) {
        return PlausibilityLevel.Typical;
    }
    return expectancyR <=
        thresholds.strongMaxExpectancyR + EXPECTANCY_R_TOLERANCE
        ? PlausibilityLevel.Strong
        : PlausibilityLevel.Implausible;
}
