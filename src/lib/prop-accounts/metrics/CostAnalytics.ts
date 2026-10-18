import {
    AccountEventKind,
    AccountStage,
    compareText,
    FeeKind,
    feePrefillCents,
    type FirmKey,
    firmKeyOf,
    groupByFirmKey,
    isEndedStatus,
    sumUsdCents,
    type UsdCents,
    usdCents,
    usdCentsFromDollars,
} from '~/lib/prop-accounts/core';
import { type FirmId } from '~/lib/prop-calculator';

import { attemptsOf } from './Attempts';
import {
    finalState,
    fundedSince,
    type LedgerAccount,
    type LedgerFeeRow,
    modeledEntries,
    type ModeledLedgerAccount,
    type PortfolioLedger,
    roundCents,
    signedFeeCents,
} from './PortfolioLedger';
import { ledgerFees, monthlyCash } from './SpendAndPayouts';

export enum PendingFeeAttribution {
    PaidOnOrAfterOpenAttemptStart = 'paid-on-or-after-open-attempt-start',
}

export interface AccountSizeCost {
    readonly accountSize: number;
    readonly attempts: number;
    readonly costPerAttempt: null | UsdCents;
    readonly spend: UsdCents;
}

export interface CostAnalytics {
    readonly byAccountSize: readonly AccountSizeCost[];
    readonly byFirm: readonly FirmSpend[];
    readonly byFirmAttemptCost: readonly FirmAttemptCost[];
    readonly byKind: Readonly<Record<FeeKind, UsdCents>>;
    readonly byMonth: readonly MonthlySpend[];
    readonly ledgerOnlyAccounts: number;
    readonly ledgerOnlySpend: UsdCents;
    readonly pendingFeeAttribution: PendingFeeAttribution;
    readonly perPlan: readonly PlanFundedCost[];
    readonly unresolvedAccounts: number;
    readonly unresolvedSpend: UsdCents;
}

export interface FirmAttemptCost {
    readonly accountsWithoutPlan: number;
    readonly attempts: number;
    readonly costPerAttempt: null | UsdCents;
    readonly firmKey: FirmKey;
    readonly impliedAttempts: number;
    readonly plansWithoutListPrice: number;
    readonly retryFeeAttempts: number;
}

export interface FirmSpend {
    readonly firmKey: FirmKey;
    readonly spend: UsdCents;
}

export interface ModeledFundedCost {
    readonly costPerFundedAccount: number;
}

export interface MonthlySpend {
    readonly month: string;
    readonly spend: UsdCents;
}

export interface PlanFundedCost {
    readonly acquisitionSpend: UsdCents;
    readonly attempts: number;
    readonly costPerAttempt: null | UsdCents;
    readonly costPerFundedAccount: null | UsdCents;
    readonly firmId: FirmId;
    readonly fundedAccounts: number;
    readonly impliedAttempts: null | number;
    readonly modeledCostPerFundedAccount: null | UsdCents;
    readonly pendingAcquisitionSpend: UsdCents;
    readonly pendingEvalAccounts: number;
    readonly planSerial: string;
    readonly realizedMinusModeled: null | UsdCents;
    readonly retryFeeAttempts: number;
}

export function attemptCostOf(accounts: readonly LedgerAccount[]): {
    readonly attempts: number;
    readonly costPerAttempt: null | UsdCents;
    readonly retryFeeAttempts: number;
    readonly spend: UsdCents;
} {
    const attempts = accounts.reduce(
        (sum, entry) => sum + attemptsOf(entry),
        0,
    );
    const { decided } = partitionFees(accounts, isAnyFee);
    const spend = netSpendOfFees(decided);
    return {
        attempts,
        costPerAttempt: attempts === 0 ? null : roundCents(spend / attempts),
        retryFeeAttempts: retryFeeAttemptsOf(accounts),
        spend,
    };
}

export function costAnalytics(
    ledger: PortfolioLedger,
    modeled: ReadonlyMap<string, ModeledFundedCost>,
): CostAnalytics {
    const fees = ledgerFees(ledger);
    return {
        byAccountSize: accountSizeCosts(ledger.resolvedAccounts),
        byFirm: groupByFirmKey(
            ledger.accounts.filter((entry) => entry.fees.length > 0),
            (entry) => firmKeyOf(entry.row),
        ).map(({ firmKey, items }) => ({
            firmKey,
            spend: netSpendOf(items),
        })),
        byFirmAttemptCost: groupByFirmKey(ledger.accounts, (entry) =>
            firmKeyOf(entry.row),
        ).map(({ firmKey, items }) => {
            const { attempts, costPerAttempt, retryFeeAttempts } =
                attemptCostOf(items);
            return {
                attempts,
                costPerAttempt,
                firmKey,
                ...firmImpliedAttempts(items),
                retryFeeAttempts,
            };
        }),
        byKind: feesByKind(fees),
        byMonth: monthlyCash(fees, []).map(({ month, spend }) => ({
            month,
            spend,
        })),
        ledgerOnlyAccounts: ledger.ledgerOnlyAccounts.length,
        ledgerOnlySpend: netSpendOf(ledger.ledgerOnlyAccounts),
        pendingFeeAttribution:
            PendingFeeAttribution.PaidOnOrAfterOpenAttemptStart,
        perPlan: ledger.planGroups().map((group) => {
            const fundedAccounts = group.accounts.filter(
                (entry) => fundedSince(entry) !== null,
            ).length;
            let pendingEvalAccounts = 0;
            for (const entry of group.accounts) {
                if (openEvalAttemptSince(entry) !== null) {
                    pendingEvalAccounts += 1;
                }
            }
            const { decided: decidedFees, pending: pendingFees } =
                partitionAcquisitionFees(group.accounts);
            const acquisitionSpend = netSpendOfFees(decidedFees);
            const costPerFundedAccount =
                fundedAccounts === 0
                    ? null
                    : roundCents(acquisitionSpend / fundedAccounts);
            const modeledCost = modeledCostCents(modeled.get(group.planSerial));
            const { attempts, costPerAttempt } = attemptCostOf(group.accounts);
            return {
                acquisitionSpend,
                attempts,
                costPerAttempt,
                costPerFundedAccount,
                firmId: group.firmId,
                fundedAccounts,
                impliedAttempts: impliedAttemptsOf(group.accounts),
                modeledCostPerFundedAccount: modeledCost,
                pendingAcquisitionSpend: netSpendOfFees(pendingFees),
                pendingEvalAccounts,
                planSerial: group.planSerial,
                realizedMinusModeled:
                    costPerFundedAccount === null || modeledCost === null
                        ? null
                        : usdCents(costPerFundedAccount - modeledCost),
                retryFeeAttempts: retryFeeAttemptsOf(group.accounts),
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

function accountSizeCosts(
    accounts: readonly LedgerAccount[],
): readonly AccountSizeCost[] {
    const bySize = new Map<number, LedgerAccount[]>();
    for (const entry of accounts) {
        const size = entry.row.accountSize;
        const list = bySize.get(size);
        if (list === undefined) {
            bySize.set(size, [entry]);
        } else {
            list.push(entry);
        }
    }
    return [...bySize]
        .toSorted(([a], [b]) => a - b)
        .map(([accountSize, items]) => {
            const { attempts, costPerAttempt, spend } = attemptCostOf(items);
            return { accountSize, attempts, costPerAttempt, spend };
        });
}

function firmImpliedAttempts(accounts: readonly LedgerAccount[]): {
    readonly accountsWithoutPlan: number;
    readonly impliedAttempts: number;
    readonly plansWithoutListPrice: number;
} {
    const modeled = modeledEntries({ accounts }).filter(
        (entry) => entry.plan !== null,
    );
    const byPlan = Map.groupBy(modeled, (entry) => entry.plan?.planSerial);
    let impliedAttempts = 0;
    let plansWithoutListPrice = 0;
    for (const group of byPlan.values()) {
        const implied = impliedAttemptsOf(group);
        if (implied === null) {
            plansWithoutListPrice += 1;
        } else {
            impliedAttempts += implied;
        }
    }
    return {
        accountsWithoutPlan: accounts.length - modeled.length,
        impliedAttempts,
        plansWithoutListPrice,
    };
}

function impliedAttemptsOf(
    accounts: readonly ModeledLedgerAccount[],
): null | number {
    const plan = accounts[0]?.plan?.plan;
    if (plan === undefined) return null;
    const listPrice = feePrefillCents(plan, FeeKind.EvalPurchase);
    if (listPrice === null) return null;
    const { decided } = partitionAcquisitionFees(accounts);
    return netSpendOfFees(decided) / listPrice;
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

function isAnyFee(): boolean {
    return true;
}

function isRetryFee(kind: FeeKind): boolean {
    return kind === FeeKind.Reset || kind === FeeKind.Rebuy;
}

function modeledCostCents(
    economics: ModeledFundedCost | undefined,
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
        state !== null &&
        state.stage === AccountStage.Eval &&
        !isEndedStatus(state.status);
    return isOpenEval
        ? (account.transitions.findLast(
              (transition) =>
                  transition.kind === AccountEventKind.Purchased ||
                  transition.kind === AccountEventKind.Reopened,
          )?.on ?? null)
        : null;
}

function partitionAcquisitionFees(accounts: readonly LedgerAccount[]): {
    readonly decided: readonly LedgerFeeRow[];
    readonly pending: readonly LedgerFeeRow[];
} {
    return partitionFees(accounts, isAcquisitionFee);
}

function partitionFees(
    accounts: readonly LedgerAccount[],
    isIncluded: (kind: FeeKind) => boolean,
): {
    readonly decided: readonly LedgerFeeRow[];
    readonly pending: readonly LedgerFeeRow[];
} {
    const decided: LedgerFeeRow[] = [];
    const pending: LedgerFeeRow[] = [];
    for (const entry of accounts) {
        const openSince = openEvalAttemptSince(entry);
        for (const fee of entry.fees) {
            if (!isIncluded(fee.kind)) continue;
            const isPending =
                openSince !== null && compareText(fee.paidOn, openSince) >= 0;
            (isPending ? pending : decided).push(fee);
        }
    }
    return { decided, pending };
}

function retryFeeAttemptsOf(accounts: readonly LedgerAccount[]): number {
    return accounts.reduce(
        (sum, entry) =>
            sum + entry.fees.filter((fee) => isRetryFee(fee.kind)).length,
        0,
    );
}
