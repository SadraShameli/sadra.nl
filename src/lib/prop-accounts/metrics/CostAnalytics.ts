import {
    AccountEventKind,
    AccountStage,
    AccountStatus,
    compareText,
    FeeKind,
    type StoredFirmId,
    sumUsdCents,
    type UsdCents,
    usdCents,
    usdCentsFromDollars,
} from '~/lib/prop-accounts/core';
import { type FirmId, type ReplacementEconomics } from '~/lib/prop-calculator';

import {
    finalState,
    fundedSince,
    type LedgerAccount,
    type LedgerFeeRow,
    type PortfolioLedger,
    roundCents,
    signedFeeCents,
} from './PortfolioLedger';
import { ledgerFees, monthlyCash } from './SpendAndPayouts';

export enum PendingFeeAttribution {
    PaidOnOrAfterOpenAttemptStart = 'paid-on-or-after-open-attempt-start',
}

export interface CostAnalytics {
    readonly byFirm: readonly FirmSpend[];
    readonly byKind: Readonly<Record<FeeKind, UsdCents>>;
    readonly byMonth: readonly MonthlySpend[];
    readonly pendingFeeAttribution: PendingFeeAttribution;
    readonly perPlan: readonly PlanFundedCost[];
    readonly unresolvedAccounts: number;
    readonly unresolvedSpend: UsdCents;
}

export interface FirmSpend {
    readonly firmId: StoredFirmId;
    readonly spend: UsdCents;
}

export interface MonthlySpend {
    readonly month: string;
    readonly spend: UsdCents;
}

export interface PlanFundedCost {
    readonly acquisitionSpend: UsdCents;
    readonly costPerFundedAccount: null | UsdCents;
    readonly firmId: FirmId;
    readonly fundedAccounts: number;
    readonly modeledCostPerFundedAccount: null | UsdCents;
    readonly pendingAcquisitionSpend: UsdCents;
    readonly pendingEvalAccounts: number;
    readonly planSerial: string;
    readonly realizedMinusModeled: null | UsdCents;
}

export function costAnalytics(
    ledger: PortfolioLedger,
    modeled: ReadonlyMap<string, ReplacementEconomics>,
): CostAnalytics {
    const fees = ledgerFees(ledger);
    const firmIds = [
        ...new Set(
            ledger.accounts
                .filter((entry) => entry.fees.length > 0)
                .map((entry) => entry.row.firmId),
        ),
    ].toSorted(compareText);
    return {
        byFirm: firmIds.map((firmId) => ({
            firmId,
            spend: netSpendOf(
                ledger.accounts.filter((entry) => entry.row.firmId === firmId),
            ),
        })),
        byKind: feesByKind(fees),
        byMonth: monthlyCash(fees, []).map(({ month, spend }) => ({
            month,
            spend,
        })),
        pendingFeeAttribution:
            PendingFeeAttribution.PaidOnOrAfterOpenAttemptStart,
        perPlan: ledger.planGroups().map((group) => {
            const fundedAccounts = group.accounts.filter(
                (entry) => fundedSince(entry) !== null,
            ).length;
            const decidedFees: LedgerFeeRow[] = [];
            const pendingFees: LedgerFeeRow[] = [];
            let pendingEvalAccounts = 0;
            for (const entry of group.accounts) {
                const openSince = openEvalAttemptSince(entry);
                if (openSince !== null) pendingEvalAccounts += 1;
                for (const fee of entry.fees) {
                    if (!isAcquisitionFee(fee.kind)) continue;
                    const isPending =
                        openSince !== null &&
                        compareText(fee.paidOn, openSince) >= 0;
                    (isPending ? pendingFees : decidedFees).push(fee);
                }
            }
            const acquisitionSpend = netSpendOfFees(decidedFees);
            const costPerFundedAccount =
                fundedAccounts === 0
                    ? null
                    : roundCents(acquisitionSpend / fundedAccounts);
            const modeledCost = modeledCostCents(modeled.get(group.planSerial));
            return {
                acquisitionSpend,
                costPerFundedAccount,
                firmId: group.firmId,
                fundedAccounts,
                modeledCostPerFundedAccount: modeledCost,
                pendingAcquisitionSpend: netSpendOfFees(pendingFees),
                pendingEvalAccounts,
                planSerial: group.planSerial,
                realizedMinusModeled:
                    costPerFundedAccount === null || modeledCost === null
                        ? null
                        : usdCents(costPerFundedAccount - modeledCost),
            };
        }),
        unresolvedAccounts: ledger.unresolvedAccounts.length,
        unresolvedSpend: netSpendOf(ledger.unresolvedAccounts),
    };
}

export function feesByKind(
    fees: readonly LedgerFeeRow[],
): Readonly<Record<FeeKind, UsdCents>> {
    const total = (kind: FeeKind): UsdCents =>
        sumUsdCents(
            fees
                .filter((fee) => fee.kind === kind)
                .map((fee) => signedFeeCents(fee)),
        );
    return {
        [FeeKind.Activation]: total(FeeKind.Activation),
        [FeeKind.EvalPurchase]: total(FeeKind.EvalPurchase),
        [FeeKind.FundedReset]: total(FeeKind.FundedReset),
        [FeeKind.Other]: total(FeeKind.Other),
        [FeeKind.Rebuy]: total(FeeKind.Rebuy),
        [FeeKind.Refund]: total(FeeKind.Refund),
        [FeeKind.Reset]: total(FeeKind.Reset),
        [FeeKind.Subscription]: total(FeeKind.Subscription),
    };
}

function isAcquisitionFee(kind: FeeKind): boolean {
    switch (kind) {
        case FeeKind.Activation:
        case FeeKind.EvalPurchase:
        case FeeKind.Other:
        case FeeKind.Rebuy:
        case FeeKind.Refund:
        case FeeKind.Reset:
        case FeeKind.Subscription: {
            return true;
        }
        case FeeKind.FundedReset: {
            return false;
        }
    }
}

function modeledCostCents(
    economics: ReplacementEconomics | undefined,
): null | UsdCents {
    return economics === undefined ||
        !Number.isFinite(economics.costPerFundedAccount)
        ? null
        : usdCentsFromDollars(economics.costPerFundedAccount);
}

function netSpendOf(accounts: readonly LedgerAccount[]): UsdCents {
    return netSpendOfFees(accounts.flatMap((entry) => entry.fees));
}

function netSpendOfFees(fees: readonly LedgerFeeRow[]): UsdCents {
    return sumUsdCents(fees.map((fee) => signedFeeCents(fee)));
}

function openEvalAttemptSince(account: LedgerAccount): null | string {
    const state = finalState(account);
    const isOpenEval =
        state?.stage === AccountStage.Eval &&
        (state.status === AccountStatus.Active ||
            state.status === AccountStatus.Suspended);
    return isOpenEval
        ? (account.transitions.findLast(
              (transition) =>
                  transition.kind === AccountEventKind.Purchased ||
                  transition.kind === AccountEventKind.Reopened,
          )?.on ?? null)
        : null;
}
