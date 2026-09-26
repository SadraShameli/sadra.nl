import {
    CENTS_PER_DOLLAR,
    dollars,
    type Dollars,
    fraction,
    type Fraction0to1,
} from '../core';
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

export const MAX_LOSS_TARGET_CAP = 1000;

const MAX_COUNT_CORRECTIONS = 4;

export enum LossSampleUnit {
    Attempt = 'attempt',
    Trial = 'trial',
}

export interface BatchLossInputs {
    attemptCost: Dollars;
    attempts: number;
    pAttemptPays: Fraction0to1;
    valuePerPayingAttempt: Dollars;
}

export interface LossTargetBudgetInputs extends LossTargetInputs {
    costPerSample: Dollars;
    costUnit: LossSampleUnit;
}

export interface LossTargetInputs {
    cap: number;
    lossProbability: (samples: number) => number;
    meanNetPerSample: Dollars;
    sampleUnit: LossSampleUnit;
    threshold: Fraction0to1 | null;
}

export function attemptsAffordable(
    budget: Dollars,
    attemptCost: Dollars,
): Quantity<number> {
    const budgetCents = Math.round(budget * CENTS_PER_DOLLAR);
    const costCents = Math.round(attemptCost * CENTS_PER_DOLLAR);
    return !isNonNegativeAmount(budget) || !(costCents > 0)
        ? missingQuantity(EconomicsReason.InvalidInput)
        : quantityOf(Math.floor(budgetCents / costCents));
}

export function batchLossClosedForm(
    inputs: BatchLossInputs,
): Quantity<Fraction0to1> {
    const { attemptCost, attempts, pAttemptPays, valuePerPayingAttempt } =
        inputs;
    if (
        !isCount(attempts) ||
        !isProbability(pAttemptPays) ||
        !isNonNegativeAmount(attemptCost) ||
        !isNonNegativeAmount(valuePerPayingAttempt)
    ) {
        return missingQuantity(EconomicsReason.InvalidInput);
    }
    const costCents = Math.round(attempts * attemptCost * CENTS_PER_DOLLAR);
    const isLossWith = (paying: number): boolean =>
        Math.round(paying * valuePerPayingAttempt * CENTS_PER_DOLLAR) <
        costCents;
    const disclosures = [EconomicsDisclosure.OneValuePerPayingAttempt];
    if (pAttemptPays === 0 || pAttemptPays === 1) {
        const paying = pAttemptPays === 1 ? attempts : 0;
        return quantityOf(fraction(isLossWith(paying) ? 1 : 0), disclosures);
    }
    const logPays = Math.log(pAttemptPays);
    const logMisses = Math.log(1 - pAttemptPays);
    let logChoose = 0;
    let probability = 0;
    for (let paying = 0; paying <= attempts && isLossWith(paying); paying++) {
        probability += Math.exp(
            logChoose + paying * logPays + (attempts - paying) * logMisses,
        );
        logChoose += Math.log(attempts - paying) - Math.log(paying + 1);
    }
    return quantityOf(fraction(Math.min(1, probability)), disclosures);
}

export function minimumAttemptsForLossTarget(
    inputs: LossTargetInputs,
): Quantity<number> {
    const { cap, lossProbability, meanNetPerSample, threshold } = inputs;
    const disclosures = [EconomicsDisclosure.DiscreteSawtooth];
    if (
        !isCount(cap) ||
        cap < 1 ||
        cap > MAX_LOSS_TARGET_CAP ||
        !Number.isFinite(meanNetPerSample) ||
        (threshold !== null && !isProbability(threshold))
    ) {
        return missingQuantity(EconomicsReason.InvalidInput, disclosures);
    }
    if (meanNetPerSample <= 0) {
        return missingQuantity(EconomicsReason.NoPositiveEdge, disclosures);
    }
    if (threshold === null) {
        return missingQuantity(EconomicsReason.ThresholdNotSet, disclosures);
    }
    let minimum: null | number = null;
    for (let attempts = cap; attempts >= 1; attempts--) {
        if (!(lossProbability(attempts) <= threshold)) break;
        minimum = attempts;
    }
    return minimum === null
        ? missingQuantity(EconomicsReason.AboveCap, disclosures)
        : quantityOf(minimum, disclosures);
}

export function minimumAttemptsForNoPayout(
    pAttemptPays: Fraction0to1,
    target: Fraction0to1,
): Quantity<number> {
    const disclosures = [EconomicsDisclosure.NoPayoutIgnoresPayoutSize];
    if (!isProbability(pAttemptPays) || !isProbability(target)) {
        return missingQuantity(EconomicsReason.InvalidInput, disclosures);
    }
    if (target >= 1) return quantityOf(0, disclosures);
    if (pAttemptPays === 0) {
        return missingQuantity(EconomicsReason.NoPayoutChance, disclosures);
    }
    if (pAttemptPays === 1) return quantityOf(1, disclosures);
    if (target === 0) {
        return missingQuantity(EconomicsReason.Unreachable, disclosures);
    }
    const logMiss = Math.log1p(0 - pAttemptPays);
    const logTarget = Math.log(target);
    const estimate = Math.ceil(logTarget / logMiss);
    if (!(logMiss < 0) || !Number.isSafeInteger(estimate)) {
        return missingQuantity(EconomicsReason.Unreachable, disclosures);
    }
    let attempts = Math.max(1, estimate);
    for (
        let step = 0;
        step < MAX_COUNT_CORRECTIONS &&
        attempts > 1 &&
        (attempts - 1) * logMiss <= logTarget;
        step++
    ) {
        attempts -= 1;
    }
    for (
        let step = 0;
        step < MAX_COUNT_CORRECTIONS && attempts * logMiss > logTarget;
        step++
    ) {
        attempts += 1;
    }
    return Number.isSafeInteger(attempts)
        ? quantityOf(attempts, disclosures)
        : missingQuantity(EconomicsReason.Unreachable, disclosures);
}

export function minimumBudgetForLossTarget(
    inputs: LossTargetBudgetInputs,
): Quantity<Dollars> {
    if (
        !isNonNegativeAmount(inputs.costPerSample) ||
        inputs.costUnit !== inputs.sampleUnit
    ) {
        return missingQuantity(EconomicsReason.InvalidInput, [
            EconomicsDisclosure.DiscreteSawtooth,
        ]);
    }
    const samples = minimumAttemptsForLossTarget(inputs);
    return samples.value === null
        ? samples
        : quantityOf(
              dollars(samples.value * inputs.costPerSample),
              samples.disclosures,
          );
}

export function noPayoutProbability(
    pAttemptPays: Fraction0to1,
    attempts: number,
): Quantity<Fraction0to1> {
    const disclosures = [EconomicsDisclosure.NoPayoutIgnoresPayoutSize];
    return !isProbability(pAttemptPays) || !isCount(attempts)
        ? missingQuantity(EconomicsReason.InvalidInput, disclosures)
        : quantityOf(fraction((1 - pAttemptPays) ** attempts), disclosures);
}
