import { dollars, type Dollars, type Fraction0to1 } from '../core';
import { fundedValueFrom } from './AttemptEconomics';
import {
    EconomicsDisclosure,
    EconomicsReason,
    isCount,
    isNonNegativeAmount,
    isProbability,
    missingQuantity,
    type Quantity,
    quantityOf,
} from './EdgeMath';

export interface FunnelWhatIf {
    attempts: number;
    fees: Dollars;
    net: Dollars;
    paid: number;
    passed: number;
    payoutMultiple: Quantity<number>;
    payouts: Dollars;
}

export interface FunnelWhatIfInputs {
    attemptCost: Dollars;
    attempts: number;
    averagePayout: Dollars;
    passProbability: Fraction0to1;
    payoutProbabilityGivenFunded: Fraction0to1;
}

export function funnelWhatIf(
    inputs: FunnelWhatIfInputs,
): Quantity<FunnelWhatIf> {
    const {
        attemptCost,
        attempts,
        averagePayout,
        passProbability,
        payoutProbabilityGivenFunded,
    } = inputs;
    const fundedValue = fundedValueFrom({
        averagePayout,
        payoutProbabilityGivenFunded,
        payoutsPerPaidFunded: 1,
    });
    if (
        fundedValue.value === null ||
        !isCount(attempts) ||
        !isNonNegativeAmount(attemptCost) ||
        !isProbability(passProbability)
    ) {
        return missingQuantity(EconomicsReason.InvalidInput);
    }
    const passed = attempts * passProbability;
    const paid = passed * payoutProbabilityGivenFunded;
    const payouts = passed * fundedValue.value;
    const fees = attempts * attemptCost;
    return quantityOf(
        {
            attempts,
            fees: dollars(fees),
            net: dollars(payouts - fees),
            paid,
            passed,
            payoutMultiple:
                attemptCost > 0
                    ? quantityOf(
                          (passProbability * fundedValue.value) / attemptCost,
                      )
                    : missingQuantity(EconomicsReason.ZeroAttemptCost),
            payouts: dollars(payouts),
        },
        [EconomicsDisclosure.OnePayoutPerPayingAccount],
    );
}
