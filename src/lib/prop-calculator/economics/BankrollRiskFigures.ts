import {
    type Dollars,
    dollars,
    fraction,
    type Fraction0to1,
} from '~/lib/prop-calculator/core';
import { type SimOutputs } from '~/lib/prop-calculator/simulator';

import { cohortOutcome, LOSS_RISK_DRAWS } from './CohortOutcome';
import { type EconomicsEstimate } from './EdgeMath';
import { attemptsAffordable, noPayoutProbability } from './LossRisk';

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
    'attemptPaysProbability' | 'costPerAttempt' | 'netValues'
>;

export function bankrollAttempts(
    out: BankrollRiskOutputs,
    bankroll: Dollars,
): null | number {
    return attemptsAffordable(bankroll, dollars(out.costPerAttempt)).value;
}

export function bankrollNoPayout(
    out: BankrollRiskOutputs,
    attempts: number,
    payoutRate: Fraction0to1 = fraction(out.attemptPaysProbability),
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
            cohortOutcome(out.netValues, attempts, LOSS_RISK_DRAWS, seed).value
                ?.lossProbability ?? null,
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
