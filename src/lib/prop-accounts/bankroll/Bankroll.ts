import {
    BankrollTransferKind,
    type SampleLevel,
} from '~/lib/prop-accounts/core';
import {
    type BootstrapInterval,
    type CohortMultiple,
    ledgerFees,
    ledgerPayouts,
    type PortfolioLedger,
    summarizeCash,
} from '~/lib/prop-accounts/metrics';
import { type SampleThresholds } from '~/lib/prop-calculator/advisor';

import {
    moneyWeightedReturn,
    type MoneyWeightedReturnCashflow,
} from './MoneyWeightedReturn';

export enum ScaleAtMultipleReason {
    CapacityNotSet = 'capacity-not-set',
    NoEndedAccounts = 'no-ended-accounts',
}

export interface Bankroll {
    readonly availableCents: number;
    readonly depositsCents: number;
    readonly grownFromCents: number;
    readonly moneyWeightedReturn: null | number;
    readonly withdrawalsCents: number;
}

export type ScaleAtMultiple =
    | {
          readonly candidateMonthlyBudgetCents: number;
          readonly interval: BootstrapInterval;
          readonly kind: 'available';
          readonly multiple: number;
          readonly n: number;
          readonly projectedMonthlyCents: number;
          readonly sampleLevel: null | SampleLevel;
      }
    | { readonly kind: 'unavailable'; readonly reason: ScaleAtMultipleReason };

export function bankrollOf(
    ledger: PortfolioLedger,
    asOfDate: string,
): Bankroll {
    const deposits = ledger.transfers.filter(
        (row) => row.kind === BankrollTransferKind.Deposit,
    );
    const withdrawals = ledger.transfers.filter(
        (row) => row.kind === BankrollTransferKind.Withdrawal,
    );
    const depositsCents = deposits.reduce((sum, row) => sum + row.amountCents, 0);
    const withdrawalsCents = withdrawals.reduce(
        (sum, row) => sum + row.amountCents,
        0,
    );
    const cash = summarizeCash(ledgerFees(ledger), ledgerPayouts(ledger));
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
        grownFromCents: depositsCents,
        moneyWeightedReturn: moneyWeightedReturn(cashflows),
        withdrawalsCents,
    };
}

export function scaleAtMeasuredMultiple(
    cohortMultiple: CohortMultiple | null,
    candidateMonthlyBudgetCents: null | number,
    _sampleThresholds: SampleThresholds,
): ScaleAtMultiple {
    if (cohortMultiple?.value == null) {
        return {
            kind: 'unavailable',
            reason: ScaleAtMultipleReason.NoEndedAccounts,
        };
    }
    if (candidateMonthlyBudgetCents === null) {
        return {
            kind: 'unavailable',
            reason: ScaleAtMultipleReason.CapacityNotSet,
        };
    }
    return {
        candidateMonthlyBudgetCents,
        interval: cohortMultiple.interval,
        kind: 'available',
        multiple: cohortMultiple.value,
        n: cohortMultiple.n,
        projectedMonthlyCents: Math.round(
            candidateMonthlyBudgetCents * cohortMultiple.value,
        ),
        sampleLevel: null,
    };
}
