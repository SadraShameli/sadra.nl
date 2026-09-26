import type {
    PropAccountRow,
    PropAccountSnapshotRow,
    PropCopyGroupRow,
    PropPayoutRow,
} from '~/server/db/schemas/prop';

import { type RulebookParameters } from '~/lib/prop-calculator/advisor';

import {
    type AccountReadIssue,
    accountShapeProblem,
    AccountTracking,
    compareText,
    isAccountDate,
    isPaidOnOrBefore,
    type ModeledAccountRow,
    paidPayoutCash,
    PayoutStatus,
    type PlanKeyInput,
    type PlanKeyResolution,
    PlanKeyResolutionKind,
    resolvePlanKey,
    sumUsdCents,
    trackedAccountOf,
    type TrackedAccountRow,
    type UsdCents,
} from '../core';
import { isActiveAccount } from '../metrics';
import { AlertDisclosure } from './AccountAlert';
import { TradingSessionCalendar } from './TradingSessionCalendar';

export enum StoredDateField {
    PayoutPaidOn = 'payout-paid-on',
    PayoutRequestedOn = 'payout-requested-on',
    PurchasedOn = 'purchased-on',
    SnapshotAsOf = 'snapshot-as-of',
}

export type AlertAccountRow = Pick<
    PropAccountRow,
    | 'accountSize'
    | 'archivedAt'
    | 'copyGroupId'
    | 'externalFirmId'
    | 'firmId'
    | 'id'
    | 'label'
    | 'optIns'
    | 'planLabel'
    | 'planSerial'
    | 'purchasedOn'
    | 'stage'
    | 'status'
    | 'tracking'
> & {
    readonly planRulesChanged?: boolean | null;
    readonly readIssues: readonly AccountReadIssue[];
};

export interface AlertContext {
    readonly accounts: readonly MonitoredAccount[];
    readonly archivedAccounts: readonly MonitoredAccount[];
    readonly copyGroups: readonly AlertCopyGroupRow[];
    readonly rulebook: RulebookParameters;
    readonly today: string;
    readonly unreadableArchivedAccounts: readonly AlertAccountRow[];
}

export type AlertCopyGroupRow = Pick<PropCopyGroupRow, 'id' | 'name'>;

export interface AlertInputs {
    readonly accounts: readonly AlertAccountRow[];
    readonly copyGroups: readonly AlertCopyGroupRow[];
    readonly payouts: readonly AlertPayoutRow[];
    readonly rulebook: RulebookParameters;
    readonly snapshots: readonly AlertSnapshotRow[];
    readonly today: string;
}

export type AlertPayoutRow = Pick<
    PropPayoutRow,
    | 'accountId'
    | 'grossCents'
    | 'netCents'
    | 'paidOn'
    | 'requestedOn'
    | 'status'
>;

export type AlertSnapshotRow = Pick<
    PropAccountSnapshotRow,
    | 'accountId'
    | 'asOf'
    | 'createdAt'
    | 'cumulativePayoutCents'
    | 'id'
    | 'payoutsTaken'
    | 'tradingDays'
>;

export interface InvalidStoredDate {
    readonly field: StoredDateField;
    readonly value: string;
}

export type ModeledMonitoredAccount = MonitoredAccount & {
    readonly account: ModeledAccountRow<AlertAccountRow>;
    readonly planKey: PlanKeyInput;
};

export interface MonitoredAccount {
    readonly account: TrackedAccountRow<AlertAccountRow>;
    readonly invalidDates: readonly InvalidStoredDate[];
    readonly latestSnapshot: AlertSnapshotRow | null;
    readonly payouts: readonly AlertPayoutRow[];
    readonly plan: PlanKeyResolution;
    readonly planKey: null | PlanKeyInput;
    readonly undatedPayouts: readonly AlertPayoutRow[];
}

export interface PayoutLedgerTotal {
    readonly cents: UsdCents;
    readonly grossCounted: number;
    readonly netCents: UsdCents;
}

interface LedgerCash {
    readonly cents: UsdCents;
    readonly grossOnly: boolean;
}

export function createAlertContext(inputs: AlertInputs): AlertContext {
    const today = TradingSessionCalendar.requireDate(inputs.today);
    const snapshots = Map.groupBy(
        inputs.snapshots,
        (snapshot) => snapshot.accountId,
    );
    const payouts = Map.groupBy(inputs.payouts, (payout) => payout.accountId);
    const monitorRow = (account: AlertAccountRow): MonitoredAccount =>
        monitor(
            account,
            snapshots.get(account.id) ?? [],
            payouts.get(account.id) ?? [],
        );
    const archived = inputs.accounts.filter(
        (account) => account.archivedAt !== null,
    );
    return {
        accounts: inputs.accounts
            .filter((account) => account.archivedAt === null)
            .map(monitorRow),
        archivedAccounts: archived.filter(isReadable).map(monitorRow),
        copyGroups: inputs.copyGroups,
        rulebook: inputs.rulebook,
        today,
        unreadableArchivedAccounts: archived.filter(
            (account) => !isReadable(account),
        ),
    };
}

export function grossDisclosureOf(
    grossCounted: number,
): readonly AlertDisclosure[] {
    return grossCounted > 0 ? [AlertDisclosure.GrossUsedForMissingNet] : [];
}

export function isActive(monitored: MonitoredAccount): boolean {
    return isActiveAccount(monitored.account);
}

export function isModeledMonitored(
    monitored: MonitoredAccount,
): monitored is ModeledMonitoredAccount {
    return (
        monitored.account.tracking === AccountTracking.Modeled &&
        monitored.planKey !== null
    );
}

export function paidLedgerTotal(
    payouts: readonly AlertPayoutRow[],
): PayoutLedgerTotal {
    return ledgerTotalOf(
        payouts.flatMap((payout) => {
            const cash = paidPayoutCash(payout);
            return cash === null ? [] : [cash];
        }),
    );
}

export function paidPayoutsThrough(
    monitored: MonitoredAccount,
    asOf: string,
): readonly AlertPayoutRow[] {
    return monitored.payouts.filter((payout) => isPaidOnOrBefore(payout, asOf));
}

export function payoutsTakenOf(monitored: MonitoredAccount): number {
    const paidCount = monitored.payouts.filter(
        (payout) => payout.status === PayoutStatus.Paid,
    ).length;
    return Math.max(monitored.latestSnapshot?.payoutsTaken ?? 0, paidCount);
}

export function requestedLedgerTotal(
    payouts: readonly AlertPayoutRow[],
): PayoutLedgerTotal {
    return ledgerTotalOf(
        payouts
            .filter((payout) => payout.status === PayoutStatus.Requested)
            .map((payout) =>
                payout.netCents === null
                    ? { cents: payout.grossCents, grossOnly: true }
                    : { cents: payout.netCents, grossOnly: false },
            ),
    );
}

function compareSnapshots(
    left: AlertSnapshotRow,
    right: AlertSnapshotRow,
): number {
    return (
        compareText(left.asOf, right.asOf) ||
        left.createdAt.getTime() - right.createdAt.getTime() ||
        compareText(left.id, right.id)
    );
}

function invalidDate(
    field: StoredDateField,
    value: null | string,
): InvalidStoredDate[] {
    return value === null || isAccountDate(value) ? [] : [{ field, value }];
}

function invalidPayoutDates(payout: AlertPayoutRow): InvalidStoredDate[] {
    return [
        ...invalidDate(StoredDateField.PayoutRequestedOn, payout.requestedOn),
        ...invalidDate(StoredDateField.PayoutPaidOn, payout.paidOn),
    ];
}

function isReadable(account: AlertAccountRow): boolean {
    return accountShapeProblem(account) === null;
}

function latestOf(
    snapshots: readonly AlertSnapshotRow[],
): AlertSnapshotRow | null {
    let latest: AlertSnapshotRow | null = null;
    for (const snapshot of snapshots) {
        if (latest === null || compareSnapshots(snapshot, latest) > 0) {
            latest = snapshot;
        }
    }
    return latest;
}

function ledgerTotalOf(cash: readonly LedgerCash[]): PayoutLedgerTotal {
    return {
        cents: sumUsdCents(cash.map((entry) => entry.cents)),
        grossCounted: cash.filter((entry) => entry.grossOnly).length,
        netCents: sumUsdCents(
            cash
                .filter((entry) => !entry.grossOnly)
                .map((entry) => entry.cents),
        ),
    };
}

function monitor(
    stored: AlertAccountRow,
    snapshots: readonly AlertSnapshotRow[],
    payouts: readonly AlertPayoutRow[],
): MonitoredAccount {
    const account = trackedAccountOf(stored);
    const planKey =
        account.tracking === AccountTracking.Modeled
            ? toPlanKey(account)
            : null;
    const datedSnapshots = snapshots.filter((snapshot) =>
        isAccountDate(snapshot.asOf),
    );
    const isDated = (payout: AlertPayoutRow): boolean =>
        invalidPayoutDates(payout).length === 0;
    return {
        account,
        invalidDates: [
            ...invalidDate(StoredDateField.PurchasedOn, account.purchasedOn),
            ...snapshots.flatMap((snapshot) =>
                invalidDate(StoredDateField.SnapshotAsOf, snapshot.asOf),
            ),
            ...payouts.flatMap(invalidPayoutDates),
        ],
        latestSnapshot: latestOf(datedSnapshots),
        payouts: payouts.filter(isDated),
        plan:
            planKey === null
                ? { kind: PlanKeyResolutionKind.LedgerOnly }
                : resolvePlanKey(planKey),
        planKey,
        undatedPayouts: payouts.filter((payout) => !isDated(payout)),
    };
}

function toPlanKey(account: ModeledAccountRow<AlertAccountRow>): PlanKeyInput {
    return {
        accountSize: account.accountSize,
        firmId: account.firmId,
        optIns: account.optIns,
        planSerial: account.planSerial,
        readIssues: account.readIssues,
    };
}
