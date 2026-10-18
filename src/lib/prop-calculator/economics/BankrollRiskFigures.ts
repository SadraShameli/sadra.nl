import {
    type Dollars,
    dollars,
    fraction,
    type Fraction0to1,
} from '~/lib/prop-calculator/core';
import { type SimOutputs } from '~/lib/prop-calculator/simulator';

import { cohortOutcome, LOSS_RISK_DRAWS } from './CohortOutcome';
import {
    type EconomicsEstimate,
    EconomicsReason,
    missingQuantity,
    type Quantity,
    quantityOf,
} from './EdgeMath';
import { attemptsAffordable, noPayoutProbability } from './LossRisk';

export interface BankrollCohortRisk {
    readonly attempts: number;
    readonly expectedFees: Dollars | null;
    readonly expectedPayouts: Dollars | null;
    readonly lossProbability: EconomicsEstimate<Fraction0to1>;
    readonly meanNet: Dollars;
    readonly netP10: Dollars;
    readonly netP90: Dollars;
}

export interface BankrollRisk {
    readonly attempts: null | number;
    readonly lossProbability: EconomicsEstimate<Fraction0to1> | null;
    readonly noPayoutProbability: null | number;
}

export interface BankrollRiskFigures {
    readonly lossProbability: null | number;
    readonly noPayoutProbability: null | number;
}

export type BankrollRiskOutputs = Pick<
    SimOutputs,
    'attemptPaysProbability' | 'costPerAttempt'
> & { readonly netValues: readonly number[] };

export function bankrollAttempts(
    out: BankrollRiskOutputs,
    bankroll: Dollars,
): null | number {
    return bankrollAttemptsAt(bankroll, dollars(out.costPerAttempt));
}

export function bankrollAttemptsAt(
    bankroll: Dollars,
    costPerAttempt: Dollars,
): null | number {
    return attemptsAffordable(bankroll, costPerAttempt).value;
}

export function bankrollCohortRisk(
    netValues: readonly number[],
    attempts: number,
    draws: number,
    seed: number,
    feeValues?: readonly number[],
): Quantity<BankrollCohortRisk> {
    if (!(attempts >= 1)) return missingQuantity(EconomicsReason.InvalidInput);
    const outcome = cohortOutcome(netValues, attempts, draws, seed, feeValues);
    return outcome.value === null
        ? outcome
        : quantityOf(
              {
                  attempts,
                  expectedFees: outcome.value.expectedFees,
                  expectedPayouts: outcome.value.expectedPayouts,
                  lossProbability: outcome.value.lossProbability,
                  meanNet: outcome.value.meanNet,
                  netP10: outcome.value.netP10,
                  netP90: outcome.value.netP90,
              },
              outcome.disclosures,
          );
}

export function bankrollNoPayout(
    out: BankrollRiskOutputs,
    attempts: number,
    payoutRate: Fraction0to1 = fraction(out.attemptPaysProbability),
): null | number {
    return bankrollNoPayoutAt(payoutRate, attempts);
}

export function bankrollNoPayoutAt(
    payoutRate: Fraction0to1,
    attempts: number,
): null | number {
    return noPayoutProbability(payoutRate, attempts).value;
}

export function bankrollRisk(
    out: BankrollRiskOutputs,
    bankroll: Dollars,
    seed: number,
    payoutRate?: Fraction0to1,
): BankrollRisk {
    const attempts = bankrollAttempts(out, bankroll);
    if (attempts === null) {
        return { attempts, lossProbability: null, noPayoutProbability: null };
    }
    return {
        attempts,
        lossProbability:
            bankrollCohortRisk(out.netValues, attempts, LOSS_RISK_DRAWS, seed)
                .value?.lossProbability ?? null,
        noPayoutProbability: bankrollNoPayout(out, attempts, payoutRate),
    };
}

export function bankrollRiskFigures(
    out: BankrollRiskOutputs,
    bankroll: Dollars,
    seed: number,
): BankrollRiskFigures {
    const attempts = bankrollAttempts(out, bankroll);
    if (attempts === null || attempts < 1) {
        return { lossProbability: null, noPayoutProbability: null };
    }
    const risk = bankrollRisk(out, bankroll, seed);
    return {
        lossProbability: risk.lossProbability?.value ?? null,
        noPayoutProbability: risk.noPayoutProbability,
    };
}
