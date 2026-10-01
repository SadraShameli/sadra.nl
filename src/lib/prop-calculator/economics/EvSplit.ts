import {
    dollars,
    type Dollars,
    type Fraction0to1,
} from '~/lib/prop-calculator/core';

import { expectedNetPerAttemptOf } from './AttemptEconomics';
import {
    EconomicsReason,
    missingQuantity,
    type Quantity,
    quantityOf,
} from './EdgeMath';

export interface ConversionEvInputs {
    attemptCost: Dollars;
    attemptPassProbability: Fraction0to1;
    freshFundedValue: Dollars;
}

export interface FundedProgressInputs {
    freshFundedValue: Dollars;
    valueNow: Dollars;
}

export function conversionEvPerAttempt(
    inputs: ConversionEvInputs,
): Quantity<Dollars> {
    return expectedNetPerAttemptOf({
        attemptCost: inputs.attemptCost,
        fundedValue: inputs.freshFundedValue,
        passProbability: inputs.attemptPassProbability,
    });
}

export function fundedProgressValue(
    inputs: FundedProgressInputs,
): Quantity<Dollars> {
    const { freshFundedValue, valueNow } = inputs;
    return !Number.isFinite(freshFundedValue) || !Number.isFinite(valueNow)
        ? missingQuantity(EconomicsReason.InvalidInput)
        : quantityOf(dollars(valueNow - freshFundedValue));
}
