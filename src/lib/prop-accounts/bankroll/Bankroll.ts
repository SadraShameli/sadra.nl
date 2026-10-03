import {
    BankrollTransferKind,
    compareText,
    sampleAdequacy,
    SampleKind,
    type SampleLevel,
} from '~/lib/prop-accounts/core';
import {
    type BootstrapInterval,
    type CohortMultiple,
    feesOnOrBefore,
    ledgerFees,
    ledgerPayouts,
    paidPayoutsOnOrBefore,
    type PortfolioLedger,
    spendAndPayouts,
    summarizeCash,
} from '~/lib/prop-accounts/metrics';
import { type SampleThresholds } from '~/lib/prop-calculator/advisor';

import {
    moneyWeightedReturn,
    type MoneyWeightedReturnCashflow,
} from './MoneyWeightedReturn';

export enum ScaleAtMultipleKind {
    Available = 'available',
    Unavailable = 'unavailable',
}

export enum ScaleAtMultipleReason {
    CapacityNotSet = 'capacity-not-set',
    NoEndedAccounts = 'no-ended-accounts',
}

export enum ScaleBudgetBasis {
    CapacityFill = 'capacity-fill',
    EnteredMonthly = 'entered-monthly',
    PlanLimit = 'plan-limit',
}

export enum ScaleCappedBy {
    Capacity = 'capacity',
    PlanLimits = 'plan-limits',
}

export interface Bankroll {
    readonly availableCents: number;
    readonly depositsCents: number;
    readonly moneyWeightedReturn: null | number;
    readonly reinvestedPayoutsCents: number;
    readonly undatedPaidPayouts: number;
    readonly withdrawalsCents: number;
}

export type ScaleAtMultiple =
    | {
          readonly budgetBasis: ScaleBudgetBasis;
          readonly budgetCents: number;
          readonly cappedBy: null | ScaleCappedBy;
          readonly interval: BootstrapInterval;
          readonly kind: ScaleAtMultipleKind.Available;
          readonly multiple: number;
          readonly n: number;
          readonly projectedCents: number;
          readonly projectedMonthlyCents: null | number;
          readonly sampleLevel: null | SampleLevel;
      }
    | {
          readonly kind: ScaleAtMultipleKind.Unavailable;
          readonly reason: ScaleAtMultipleReason;
      };

export interface ScaleBudgetInputs {
    readonly capacityFillCents: null | number;
    readonly enteredMonthlyCents: null | number;
    readonly planLimitCents: null | number;
}

interface ScaleBudget {
    readonly basis: ScaleBudgetBasis;
    readonly cappedBy: null | ScaleCappedBy;
    readonly cents: number;
}

export function bankrollOf(
    ledger: PortfolioLedger,
    asOfDate: string,
): Bankroll {
    const transfers = ledger.transfers.filter(
        (row) => compareText(row.occurredOn, asOfDate) <= 0,
    );
    const deposits = transfers.filter(
        (row) => row.kind === BankrollTransferKind.Deposit,
    );
    const withdrawals = transfers.filter(
        (row) => row.kind === BankrollTransferKind.Withdrawal,
    );
    const depositsCents = deposits.reduce(
        (sum, row) => sum + row.amountCents,
        0,
    );
    const withdrawalsCents = withdrawals.reduce(
        (sum, row) => sum + row.amountCents,
        0,
    );
    const cash = summarizeCash(
        feesOnOrBefore(ledgerFees(ledger), asOfDate),
        paidPayoutsOnOrBefore(ledgerPayouts(ledger), asOfDate),
    );
    const availableCents =
        depositsCents + cash.payouts - cash.spend - withdrawalsCents;
    const cashflows: MoneyWeightedReturnCashflow[] = [
        ...deposits.map((row) => ({
            amountCents: 0 - row.amountCents,
            on: row.occurredOn,
        })),
        ...withdrawals.map((row) => ({
            amountCents: row.amountCents,
            on: row.occurredOn,
        })),
        { amountCents: availableCents, on: asOfDate },
    ];
    return {
        availableCents,
        depositsCents,
        moneyWeightedReturn: moneyWeightedReturn(cashflows),
        reinvestedPayoutsCents: Math.min(
            cash.payouts,
            Math.max(0, cash.spend - depositsCents),
        ),
        undatedPaidPayouts: spendAndPayouts(ledger).undatedPaidPayouts,
        withdrawalsCents,
    };
}

export function scaleAtMeasuredMultiple(
    cohortMultiple: CohortMultiple | null,
    budgets: ScaleBudgetInputs,
    sampleThresholds: SampleThresholds,
): ScaleAtMultiple {
    if (cohortMultiple?.value == null) {
        return {
            kind: ScaleAtMultipleKind.Unavailable,
            reason: ScaleAtMultipleReason.NoEndedAccounts,
        };
    }
    const budget = scaleBudgetOf(budgets);
    if (budget === null) {
        return {
            kind: ScaleAtMultipleKind.Unavailable,
            reason: ScaleAtMultipleReason.CapacityNotSet,
        };
    }
    const projectedCents = Math.round(budget.cents * cohortMultiple.value);
    return {
        budgetBasis: budget.basis,
        budgetCents: budget.cents,
        cappedBy: budget.cappedBy,
        interval: cohortMultiple.interval,
        kind: ScaleAtMultipleKind.Available,
        multiple: cohortMultiple.value,
        n: cohortMultiple.n,
        projectedCents,
        projectedMonthlyCents:
            budget.basis === ScaleBudgetBasis.EnteredMonthly
                ? projectedCents
                : null,
        sampleLevel: sampleAdequacy(
            SampleKind.EndedAccounts,
            cohortMultiple.n,
            sampleThresholds,
        ),
    };
}

function positiveCentsOf(cents: null | number): null | number {
    return cents !== null && Number.isSafeInteger(cents) && cents > 0
        ? cents
        : null;
}

function scaleBudgetOf(budgets: ScaleBudgetInputs): null | ScaleBudget {
    const limit = scaleLimitOf(budgets);
    const entered = positiveCentsOf(budgets.enteredMonthlyCents);
    if (entered === null) {
        return limit === null
            ? null
            : { basis: limit.basis, cappedBy: null, cents: limit.cents };
    }
    if (limit === null || entered <= limit.cents) {
        return {
            basis: ScaleBudgetBasis.EnteredMonthly,
            cappedBy: null,
            cents: entered,
        };
    }
    return limit;
}

function scaleLimitOf(budgets: ScaleBudgetInputs): null | ScaleBudget {
    const capacityFillCents = positiveCentsOf(budgets.capacityFillCents);
    const planLimitCents = positiveCentsOf(budgets.planLimitCents);
    if (
        capacityFillCents !== null &&
        (planLimitCents === null || capacityFillCents <= planLimitCents)
    ) {
        return {
            basis: ScaleBudgetBasis.CapacityFill,
            cappedBy: ScaleCappedBy.Capacity,
            cents: capacityFillCents,
        };
    }
    if (planLimitCents === null) return null;
    return {
        basis: ScaleBudgetBasis.PlanLimit,
        cappedBy: ScaleCappedBy.PlanLimits,
        cents: planLimitCents,
    };
}
