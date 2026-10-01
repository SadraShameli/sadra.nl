import { dollars, type Dollars, fraction, type Fraction0to1 } from '~/lib/prop-calculator/core';
import { type SimEstimates, type SimOutputs } from '~/lib/prop-calculator/simulator';

import {
    type EconomicsEstimate,
    EconomicsReason,
    isNonNegativeAmount,
    isProbability,
    missingQuantity,
    type Quantity,
    quantityOf,
} from './EdgeMath';

export enum AccountBasis {
    CopyGroup = 'copy-group',
}

export enum NetBasis {
    CreditFree = 'credit-free',
}

export interface AttemptEconomics {
    attemptCost: Dollars;
    breakevenPassRate: Quantity<Fraction0to1>;
    expectedNetPerAttempt: Dollars;
    fundedValue: Dollars;
    fundedValueToAttemptCost: Quantity<FundedValueToAttemptCost>;
    passMargin: Quantity<number>;
    passProbability: Fraction0to1;
}

export interface AttemptEconomicsInputs {
    attemptCost: Dollars;
    fundedValue: Dollars;
    passProbability: Fraction0to1;
}

export interface FundedValueInputs {
    averagePayout: Dollars;
    payoutProbabilityGivenFunded: Fraction0to1;
    payoutsPerPaidFunded: number;
}

export interface FundedValueToAttemptCost {
    label: string;
    netToOne: number;
    ratio: number;
}

export interface RunAttemptEconomics extends Omit<
    AttemptEconomics,
    'expectedNetPerAttempt'
> {
    accountBasis: AccountBasis;
    attemptCostStandardError: number;
    basis: NetBasis;
    copyAccounts: number;
    expectedNetPerAttempt: EconomicsEstimate<Dollars>;
    fundedHorizonDays: number;
    passProbabilityStandardError: number;
}

export type RunAttemptOutputs = Pick<
    SimOutputs,
    | 'attemptPassProbability'
    | 'copyAccounts'
    | 'costPerAttempt'
    | 'expectedNetPerAttempt'
    | 'expectedPayoutPerFundedAccount'
> & {
    estimates: Pick<
        SimEstimates,
        'attemptPassProbability' | 'costPerAttempt' | 'expectedNetPerAttempt'
    >;
};

export function attemptEconomics(
    inputs: AttemptEconomicsInputs,
): Quantity<AttemptEconomics> {
    const expectedNetPerAttempt = expectedNetPerAttemptOf(inputs);
    if (expectedNetPerAttempt.value === null) return expectedNetPerAttempt;
    const { attemptCost, fundedValue, passProbability } = inputs;
    const breakevenPassRate = breakevenPassRateOf(attemptCost, fundedValue);
    return quantityOf({
        attemptCost,
        breakevenPassRate,
        expectedNetPerAttempt: expectedNetPerAttempt.value,
        fundedValue,
        fundedValueToAttemptCost: fundedValueToAttemptCostOf(
            attemptCost,
            fundedValue,
        ),
        passMargin:
            breakevenPassRate.value === null
                ? breakevenPassRate
                : quantityOf(passProbability - breakevenPassRate.value),
        passProbability,
    });
}

export function attemptEconomicsOfRun(
    outputs: RunAttemptOutputs,
    fundedHorizonDays: number,
): Quantity<RunAttemptEconomics> {
    const { copyAccounts, estimates } = outputs;
    if (
        !isNonNegativeAmount(fundedHorizonDays) ||
        !Number.isSafeInteger(copyAccounts) ||
        copyAccounts < 1 ||
        !Number.isFinite(outputs.expectedNetPerAttempt)
    ) {
        return missingQuantity(EconomicsReason.InvalidInput);
    }
    const decomposition = attemptEconomics({
        attemptCost: dollars(outputs.costPerAttempt),
        fundedValue: dollars(
            outputs.expectedPayoutPerFundedAccount * copyAccounts,
        ),
        passProbability: fraction(outputs.attemptPassProbability),
    });
    if (decomposition.value === null) return decomposition;
    return quantityOf({
        ...decomposition.value,
        accountBasis: AccountBasis.CopyGroup,
        attemptCostStandardError: estimates.costPerAttempt.standardError,
        basis: NetBasis.CreditFree,
        copyAccounts,
        expectedNetPerAttempt: {
            standardError: estimates.expectedNetPerAttempt.standardError,
            value: dollars(outputs.expectedNetPerAttempt),
        },
        fundedHorizonDays,
        passProbabilityStandardError:
            estimates.attemptPassProbability.standardError,
    });
}

export function expectedNetPerAttemptOf(
    inputs: AttemptEconomicsInputs,
): Quantity<Dollars> {
    const { attemptCost, fundedValue, passProbability } = inputs;
    return !isNonNegativeAmount(attemptCost) ||
        !isNonNegativeAmount(fundedValue) ||
        !isProbability(passProbability)
        ? missingQuantity(EconomicsReason.InvalidInput)
        : quantityOf(dollars(passProbability * fundedValue - attemptCost));
}

export function fundedValueFrom(inputs: FundedValueInputs): Quantity<Dollars> {
    const {
        averagePayout,
        payoutProbabilityGivenFunded,
        payoutsPerPaidFunded,
    } = inputs;
    return !isNonNegativeAmount(averagePayout) ||
        !isProbability(payoutProbabilityGivenFunded) ||
        !isNonNegativeAmount(payoutsPerPaidFunded)
        ? missingQuantity(EconomicsReason.InvalidInput)
        : quantityOf(
              dollars(
                  payoutProbabilityGivenFunded *
                      payoutsPerPaidFunded *
                      averagePayout,
              ),
          );
}

export function fundedValueToAttemptCostLabel(netToOne: number): string {
    return `funded value / attempt cost; net ${netToOne.toLocaleString('en-US', { maximumFractionDigits: 2 })}:1`;
}

function breakevenPassRateOf(
    attemptCost: Dollars,
    fundedValue: Dollars,
): Quantity<Fraction0to1> {
    if (fundedValue <= 0) {
        return missingQuantity(EconomicsReason.NoFundedValue);
    }
    const rate = attemptCost / fundedValue;
    return rate > 1
        ? missingQuantity(EconomicsReason.Unreachable)
        : quantityOf(fraction(rate));
}

function fundedValueToAttemptCostOf(
    attemptCost: Dollars,
    fundedValue: Dollars,
): Quantity<FundedValueToAttemptCost> {
    if (attemptCost <= 0) {
        return missingQuantity(EconomicsReason.ZeroAttemptCost);
    }
    const ratio = fundedValue / attemptCost;
    const netToOne = ratio - 1;
    return quantityOf({
        label: fundedValueToAttemptCostLabel(netToOne),
        netToOne,
        ratio,
    });
}
