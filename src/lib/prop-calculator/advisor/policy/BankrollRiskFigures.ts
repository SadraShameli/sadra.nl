import { type Dollars, dollars, fraction } from '~/lib/prop-calculator/core';
import {
    attemptsAffordable,
    cohortOutcome,
    LOSS_RISK_DRAWS,
    noPayoutProbability,
} from '~/lib/prop-calculator/economics';
import { type SimOutputs } from '~/lib/prop-calculator/simulator';

export interface BankrollRiskFigures {
    readonly lossProbability: null | number;
    readonly noPayoutProbability: null | number;
}

export function bankrollRiskFigures(
    out: Pick<
        SimOutputs,
        'attemptPaysProbability' | 'costPerAttempt' | 'netValues'
    >,
    bankroll: Dollars,
    seed: number,
): BankrollRiskFigures {
    const attempts = attemptsAffordable(
        bankroll,
        dollars(out.costPerAttempt),
    ).value;
    if (attempts === null || attempts < 1) {
        return { lossProbability: null, noPayoutProbability: null };
    }
    return {
        lossProbability:
            cohortOutcome(out.netValues, attempts, LOSS_RISK_DRAWS, seed).value
                ?.lossProbability.value ?? null,
        noPayoutProbability:
            noPayoutProbability(fraction(out.attemptPaysProbability), attempts)
                .value ?? null,
    };
}
