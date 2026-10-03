import {
    type Dollars,
    dollars,
    type Fraction0to1,
    TRADING_DAYS_PER_MONTH,
} from '~/lib/prop-calculator/core';

import { compoundedBankroll } from './BankrollCompounding';
import { compoundMinimumBudget } from './BankrollCurve';
import { empiricalPayingStatsOf } from './BankrollLevers';
import { type Quantity } from './EdgeMath';
import { batchLossClosedForm } from './LossRisk';

const DEFAULT_CURVE_SEED = 1;

export interface BankrollLossRiskSummary {
    readonly attemptCost: Dollars;
    readonly closedFormCrossCheck: null | Quantity<Fraction0to1>;
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
    seed: number = DEFAULT_CURVE_SEED,
): BankrollLossRiskSummary {
    const attemptCost = dollars(costPerAttempt);
    const { pAttemptPays, valuePerPayingAttempt } = empiricalPayingStatsOf(
        netValues,
        costPerAttempt,
    );
    const budget = compoundMinimumBudget({
        costPerAttempt: attemptCost,
        lossThreshold,
        netValues,
        seed,
    });
    const minimumAttempts =
        budget.value !== null && attemptCost > 0
            ? Math.round(budget.value / attemptCost)
            : null;
    return {
        attemptCost,
        closedFormCrossCheck:
            budget.value === null
                ? null
                : batchLossClosedForm({
                      attemptCost,
                      attempts: minimumAttempts ?? 0,
                      pAttemptPays,
                      valuePerPayingAttempt,
                  }),
        minimumBudget:
            budget.value === null
                ? budget
                : {
                      disclosures: budget.disclosures,
                      reason: null,
                      value: {
                          attempts: minimumAttempts ?? 0,
                          budget: budget.value,
                      },
                  },
        pAttemptPays,
        valuePerPayingAttempt,
    };
}
