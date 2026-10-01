import {
    CENTS_PER_DOLLAR,
    dollars,
    type Dollars,
    fraction,
    type Fraction0to1,
} from '~/lib/prop-calculator/core';
import { mulberry32 } from '~/lib/prop-calculator/rng';
import { binomialStandardError, mean, percentile } from '~/lib/prop-calculator/stats';

import {
    type EconomicsEstimate,
    EconomicsReason,
    isCount,
    missingQuantity,
    type Quantity,
    quantityOf,
} from './EdgeMath';

export const LOSS_RISK_DRAWS = 10_000;
export const MAX_COHORT_SAMPLES = 20_000_000;

export interface CohortOutcome {
    attempts: number;
    draws: number;
    expectedFees: Dollars | null;
    expectedPayouts: Dollars | null;
    lossProbability: EconomicsEstimate<Fraction0to1>;
    meanNet: Dollars;
    netP10: Dollars;
    netP90: Dollars;
}

export function cohortOutcome(
    netValues: readonly number[],
    attempts: number,
    draws: number,
    seed: number,
    feeValues?: readonly number[],
): Quantity<CohortOutcome> {
    if (
        netValues.length === 0 ||
        netValues.some((value) => !Number.isFinite(value)) ||
        !isCount(attempts) ||
        attempts < 1 ||
        !isCount(draws) ||
        draws < 1 ||
        draws * attempts > MAX_COHORT_SAMPLES ||
        (feeValues !== undefined &&
            (feeValues.length !== netValues.length ||
                feeValues.some((value) => !Number.isFinite(value))))
    ) {
        return missingQuantity(EconomicsReason.InvalidInput);
    }
    const rng = mulberry32(seed);
    const batchNets: number[] = [];
    let losses = 0;
    for (let draw = 0; draw < draws; draw++) {
        let batchNet = 0;
        for (let attempt = 0; attempt < attempts; attempt++) {
            batchNet += netValues[Math.floor(rng() * netValues.length)] ?? 0;
        }
        if (Math.round(batchNet * CENTS_PER_DOLLAR) < 0) losses += 1;
        batchNets.push(batchNet);
    }
    const lossProbability = fraction(losses / draws);
    const meanFee = feeValues === undefined ? null : mean(feeValues);
    return quantityOf({
        attempts,
        draws,
        expectedFees: meanFee === null ? null : dollars(attempts * meanFee),
        expectedPayouts:
            meanFee === null
                ? null
                : dollars(attempts * (mean(netValues) + meanFee)),
        lossProbability: {
            standardError: binomialStandardError(lossProbability, draws),
            value: lossProbability,
        },
        meanNet: dollars(mean(batchNets)),
        netP10: dollars(percentile(batchNets, 10)),
        netP90: dollars(percentile(batchNets, 90)),
    });
}
