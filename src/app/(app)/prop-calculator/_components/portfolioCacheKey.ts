import { type PlanOptIns, type SimInputs } from '~/lib/prop-calculator';

import { simInputsCacheKey, SimInputsKeyField } from './simInputsCacheKey';
import { type PortfolioEntry } from './types';

const PER_ENTRY_FIELDS: readonly SimInputsKeyField[] = [
    SimInputsKeyField.ActivationDiscount,
    SimInputsKeyField.BundleDiscount,
    SimInputsKeyField.CopyAccounts,
    SimInputsKeyField.EarlyWithdrawal,
    SimInputsKeyField.EvalDiscount,
    SimInputsKeyField.FundedReset,
    SimInputsKeyField.MonthlyDiscount,
    SimInputsKeyField.PlanId,
    SimInputsKeyField.ResetDiscount,
];

export function portfolioCacheKey(
    baseInputs: Omit<SimInputs, 'plan'>,
    portfolio: readonly PortfolioEntry[],
    optIns: PlanOptIns,
): string {
    return simInputsCacheKey(baseInputs, {
        extra: {
            optIns,
            portfolio: portfolio.map((entry) => ({
                actDiscount: entry.activationDiscountPercent,
                count: entry.count,
                evalDiscount: entry.evalDiscountPercent,
                firmId: entry.firmId,
                instrument: entry.instrument,
                linkAct: entry.linkActivationDiscount,
                msubDiscount: entry.monthlySubscriptionDiscountPercent,
                planId: entry.planId,
                resetDiscount: entry.resetDiscountPercent,
                stopPoints: entry.stopPoints,
            })),
        },
        omit: PER_ENTRY_FIELDS,
    });
}
