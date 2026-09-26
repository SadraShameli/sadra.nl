import { dollars, type Dollars } from '../core';
import {
    EconomicsDisclosure,
    EconomicsReason,
    isNonNegativeAmount,
    missingQuantity,
    type Quantity,
    quantityOf,
} from './EdgeMath';

export interface CompoundingCycle {
    cycleDays: number;
    multiple: number;
}

const ILLUSTRATION = [EconomicsDisclosure.DeterministicIllustration];

export function compareCycles(
    start: Dollars,
    cycles: readonly CompoundingCycle[],
    horizonDays: number,
): Quantity<Dollars>[] {
    return cycles.map(({ cycleDays, multiple }) =>
        compoundedBankroll(start, multiple, cycleDays, horizonDays),
    );
}

export function compoundedBankroll(
    start: Dollars,
    multiple: number,
    cycleDays: number,
    horizonDays: number,
): Quantity<Dollars> {
    if (
        !isNonNegativeAmount(start) ||
        !isNonNegativeAmount(multiple) ||
        !(Number.isFinite(cycleDays) && cycleDays > 0) ||
        !isNonNegativeAmount(horizonDays)
    ) {
        return missingQuantity(EconomicsReason.InvalidInput, ILLUSTRATION);
    }
    const cycles = Math.floor(horizonDays / cycleDays);
    return quantityOf(dollars(start * multiple ** cycles), ILLUSTRATION);
}
