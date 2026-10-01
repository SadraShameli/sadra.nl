import { type Dollars, dollars, type Fraction0to1, TRADING_DAYS_PER_MONTH } from '~/lib/prop-calculator/core';
import { mean } from '~/lib/prop-calculator/stats';

import { compoundedBankroll } from './BankrollCompounding';
import { empiricalPayingStatsOf } from './BankrollLevers';
import { type Quantity } from './EdgeMath';
import {
    batchLossClosedForm,
    LossSampleUnit,
    MAX_LOSS_TARGET_CAP,
    minimumBudgetForLossTarget,
} from './LossRisk';

export interface BankrollLossRiskSummary {
    readonly attemptCost: Dollars;
    readonly minimumBudget: Quantity<BankrollMinimumBudget>;
    readonly pAttemptPays: Fraction0to1;
    readonly valuePerPayingAttempt: Dollars;
}

export interface BankrollMinimumBudget {
    readonly attempts: number;
    readonly budget: Dollars;
}

export interface CompoundingIllustration {
    readonly cycleDays: number;
    readonly multiple: number;
    readonly quantity: Quantity<Dollars>;
}

export function bankrollCompoundingIllustration(
    start: Dollars,
    reinvestFraction: Fraction0to1,
    horizonDays: number,
): CompoundingIllustration | null {
    if (!(reinvestFraction > 0)) return null;
    const multiple = 1 + reinvestFraction;
    const cycleDays = TRADING_DAYS_PER_MONTH;
    return {
        cycleDays,
        multiple,
        quantity: compoundedBankroll(start, multiple, cycleDays, horizonDays),
    };
}

export function bankrollLossRiskSummary(
    netValues: readonly number[],
    costPerAttempt: number,
    lossThreshold: Fraction0to1 | null,
): BankrollLossRiskSummary {
    const attemptCost = dollars(costPerAttempt);
    const { pAttemptPays, valuePerPayingAttempt } = empiricalPayingStatsOf(
        netValues,
        costPerAttempt,
    );
    const budget = minimumBudgetForLossTarget({
        cap: MAX_LOSS_TARGET_CAP,
        costPerSample: attemptCost,
        costUnit: LossSampleUnit.Attempt,
        lossProbability: (samples) =>
            batchLossClosedForm({
                attemptCost,
                attempts: samples,
                pAttemptPays,
                valuePerPayingAttempt,
            }).value ?? 1,
        meanNetPerSample: dollars(mean(netValues)),
        sampleUnit: LossSampleUnit.Attempt,
        threshold: lossThreshold,
    });
    return {
        attemptCost,
        minimumBudget:
            budget.value === null
                ? budget
                : {
                      disclosures: budget.disclosures,
                      reason: null,
                      value: {
                          attempts:
                              attemptCost > 0
                                  ? Math.round(budget.value / attemptCost)
                                  : 0,
                          budget: budget.value,
                      },
                  },
        pAttemptPays,
        valuePerPayingAttempt,
    };
}
