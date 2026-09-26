import type {
    PropAccountRow,
    PropAccountSnapshotRow,
} from '~/server/db/schemas/prop';

import { dollars, type Dollars, type Plan } from '~/lib/prop-calculator';
import {
    type SnapshotDraftFields,
    snapshotDraftIssues,
    SnapshotInputField,
    SnapshotIssueSeverity,
    type SnapshotPlausibilityIssue,
    SnapshotPlausibilityIssueKind,
} from '~/lib/prop-calculator/advisor';

import { type AccountStage } from './AccountStage';
import { type UsdCents, usdCentsToDollars } from './UsdCents';

enum SnapshotEntryScope {
    Account = 'account',
    Snapshot = 'snapshot',
}

export type SnapshotEntryAccount = Pick<
    PropAccountRow,
    'accountSize' | 'dashboardConvention' | 'liveStartBalanceCents'
>;

export interface SnapshotEntryCheck {
    readonly blocking: readonly SnapshotPlausibilityIssue[];
    readonly warnings: readonly SnapshotPlausibilityIssue[];
}

export type SnapshotEntryValues = Pick<
    PropAccountSnapshotRow,
    | 'balanceAtLastPayoutCents'
    | 'balanceCents'
    | 'cumulativePayoutCents'
    | 'cycleBestDayProfitCents'
    | 'dashboardFloorCents'
    | 'evalBestDayProfitCents'
    | 'floorAtLastPayoutCents'
    | 'highestEodBalanceCents'
    | 'highestIntradayBalanceCents'
    | 'lastPayoutOn'
    | 'lastTradedOn'
    | 'payoutsTaken'
    | 'qualifyingDaysSinceLastPayout'
    | 'tradingDays'
>;

export function checkSnapshotEntry(
    plan: Plan,
    stage: AccountStage,
    account: SnapshotEntryAccount,
    snapshot: SnapshotEntryValues,
): SnapshotEntryCheck {
    return splitSnapshotEntryIssues(
        snapshotEntryIssues(plan, stage, account, snapshot),
    );
}

const SNAPSHOT_ENTRY_SCOPES: Readonly<
    Record<SnapshotInputField, SnapshotEntryScope>
> = {
    [SnapshotInputField.AsOf]: SnapshotEntryScope.Snapshot,
    [SnapshotInputField.Balance]: SnapshotEntryScope.Snapshot,
    [SnapshotInputField.BalanceAtLastPayout]: SnapshotEntryScope.Snapshot,
    [SnapshotInputField.CumulativePayout]: SnapshotEntryScope.Snapshot,
    [SnapshotInputField.CycleBestDayProfit]: SnapshotEntryScope.Snapshot,
    [SnapshotInputField.DashboardConvention]: SnapshotEntryScope.Account,
    [SnapshotInputField.DashboardFloor]: SnapshotEntryScope.Snapshot,
    [SnapshotInputField.EvalBestDayProfit]: SnapshotEntryScope.Snapshot,
    [SnapshotInputField.FirstFundedTradeOn]: SnapshotEntryScope.Account,
    [SnapshotInputField.FloorAtLastPayout]: SnapshotEntryScope.Snapshot,
    [SnapshotInputField.FundedOn]: SnapshotEntryScope.Account,
    [SnapshotInputField.FundedResetsUsed]: SnapshotEntryScope.Account,
    [SnapshotInputField.HighestEodBalance]: SnapshotEntryScope.Snapshot,
    [SnapshotInputField.HighestIntradayBalance]: SnapshotEntryScope.Snapshot,
    [SnapshotInputField.LastPayoutOn]: SnapshotEntryScope.Snapshot,
    [SnapshotInputField.LastTradedOn]: SnapshotEntryScope.Snapshot,
    [SnapshotInputField.LiveStartBalance]: SnapshotEntryScope.Account,
    [SnapshotInputField.PayoutsTaken]: SnapshotEntryScope.Snapshot,
    [SnapshotInputField.PendingPayouts]: SnapshotEntryScope.Account,
    [SnapshotInputField.PurchasedOn]: SnapshotEntryScope.Account,
    [SnapshotInputField.QualifyingDaysSinceLastPayout]:
        SnapshotEntryScope.Snapshot,
    [SnapshotInputField.Stage]: SnapshotEntryScope.Account,
    [SnapshotInputField.TradingDays]: SnapshotEntryScope.Snapshot,
};

const ACCOUNT_FIX_NOTE =
    'This is set on the account, so edit the account to fix it; a snapshot cannot change it.';

const WARNING_ONLY_KINDS: ReadonlySet<SnapshotPlausibilityIssueKind> = new Set([
    SnapshotPlausibilityIssueKind.BalanceFarAboveAccountSize,
]);

export function liveStartEntryIssues(
    plan: Plan,
    stage: AccountStage,
    account: SnapshotEntryAccount,
): readonly SnapshotPlausibilityIssue[] {
    return snapshotDraftIssues(
        plan,
        stage,
        account.dashboardConvention,
        dollars(account.accountSize),
        { liveStartBalance: dollarsOf(account.liveStartBalanceCents) },
    );
}

export function snapshotEntryIssueMessage(
    issue: SnapshotPlausibilityIssue,
): string {
    switch (SNAPSHOT_ENTRY_SCOPES[issue.field]) {
        case SnapshotEntryScope.Account: {
            return `${issue.message} ${ACCOUNT_FIX_NOTE}`;
        }
        case SnapshotEntryScope.Snapshot: {
            return issue.message;
        }
    }
}

export function snapshotEntryIssues(
    plan: Plan,
    stage: AccountStage,
    account: SnapshotEntryAccount,
    snapshot: SnapshotEntryValues,
): readonly SnapshotPlausibilityIssue[] {
    return snapshotDraftIssues(
        plan,
        stage,
        account.dashboardConvention,
        dollars(account.accountSize),
        draftFieldsOf(account, snapshot),
    );
}

export function splitSnapshotEntryIssues(
    issues: readonly SnapshotPlausibilityIssue[],
): SnapshotEntryCheck {
    return {
        blocking: issues.filter((issue) => !isWarningOnly(issue)),
        warnings: issues.filter((issue) => isWarningOnly(issue)),
    };
}

function dollarsOf(cents: null | UsdCents): Dollars | undefined {
    return cents === null ? undefined : usdCentsToDollars(cents);
}

function draftFieldsOf(
    account: SnapshotEntryAccount,
    snapshot: SnapshotEntryValues,
): SnapshotDraftFields {
    return {
        balance: usdCentsToDollars(snapshot.balanceCents),
        balanceAtLastPayout: dollarsOf(snapshot.balanceAtLastPayoutCents),
        cumulativePayout: dollarsOf(snapshot.cumulativePayoutCents),
        cycleBestDayProfit: dollarsOf(snapshot.cycleBestDayProfitCents),
        dashboardFloor: dollarsOf(snapshot.dashboardFloorCents),
        evalBestDayProfit: dollarsOf(snapshot.evalBestDayProfitCents),
        floorAtLastPayout: dollarsOf(snapshot.floorAtLastPayoutCents),
        highestEodBalance: dollarsOf(snapshot.highestEodBalanceCents),
        highestIntradayBalance: dollarsOf(snapshot.highestIntradayBalanceCents),
        lastPayoutOn: snapshot.lastPayoutOn ?? undefined,
        lastTradedOn: snapshot.lastTradedOn ?? undefined,
        liveStartBalance: dollarsOf(account.liveStartBalanceCents),
        payoutsTaken: snapshot.payoutsTaken ?? undefined,
        qualifyingDaysSinceLastPayout:
            snapshot.qualifyingDaysSinceLastPayout ?? undefined,
        tradingDays: snapshot.tradingDays ?? undefined,
    };
}

function isWarningOnly(issue: SnapshotPlausibilityIssue): boolean {
    switch (issue.severity) {
        case SnapshotIssueSeverity.Impossible: {
            return false;
        }
        case SnapshotIssueSeverity.Unlikely: {
            return WARNING_ONLY_KINDS.has(issue.kind);
        }
    }
}
