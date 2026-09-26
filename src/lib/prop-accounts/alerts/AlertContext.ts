import type {
    PropAccountRow,
    PropAccountSnapshotRow,
    PropCopyGroupRow,
    PropPayoutRow,
} from '~/server/db/schemas/prop';

import { type RulebookParameters } from '~/lib/prop-calculator/advisor';

import {
    type AccountReadIssue,
    compareText,
    isAccountDate,
    isPaidOnOrBefore,
    type PlanKeyInput,
    type PlanKeyResolution,
    resolvePlanKey,
    type StoredFirmId,
} from '../core';
import { isActiveAccount } from '../metrics';
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
    | 'id'
    | 'label'
    | 'optIns'
    | 'planSerial'
    | 'purchasedOn'
    | 'stage'
    | 'status'
> & {
    readonly firmId: StoredFirmId;
    readonly readIssues: readonly AccountReadIssue[];
};

export interface AlertContext {
    readonly accounts: readonly MonitoredAccount[];
    readonly copyGroups: readonly AlertCopyGroupRow[];
    readonly rulebook: RulebookParameters;
    readonly today: string;
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

export interface MonitoredAccount {
    readonly account: AlertAccountRow;
    readonly invalidDates: readonly InvalidStoredDate[];
    readonly latestSnapshot: AlertSnapshotRow | null;
    readonly payouts: readonly AlertPayoutRow[];
    readonly plan: PlanKeyResolution;
    readonly planKey: PlanKeyInput;
}

export function createAlertContext(inputs: AlertInputs): AlertContext {
    const today = TradingSessionCalendar.requireDate(inputs.today);
    const snapshots = Map.groupBy(
        inputs.snapshots,
        (snapshot) => snapshot.accountId,
    );
    const payouts = Map.groupBy(inputs.payouts, (payout) => payout.accountId);
    return {
        accounts: inputs.accounts
            .filter((account) => account.archivedAt === null)
            .map((account) =>
                monitor(
                    account,
                    snapshots.get(account.id) ?? [],
                    payouts.get(account.id) ?? [],
                ),
            ),
        copyGroups: inputs.copyGroups,
        rulebook: inputs.rulebook,
        today,
    };
}

export function isActive(monitored: MonitoredAccount): boolean {
    return isActiveAccount(monitored.account);
}

export function paidPayoutsThrough(
    monitored: MonitoredAccount,
    asOf: string,
): readonly AlertPayoutRow[] {
    return monitored.payouts.filter((payout) => isPaidOnOrBefore(payout, asOf));
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

function monitor(
    account: AlertAccountRow,
    snapshots: readonly AlertSnapshotRow[],
    payouts: readonly AlertPayoutRow[],
): MonitoredAccount {
    const planKey = toPlanKey(account);
    const datedSnapshots = snapshots.filter((snapshot) =>
        isAccountDate(snapshot.asOf),
    );
    const datedPayouts = payouts.filter(
        (payout) => invalidPayoutDates(payout).length === 0,
    );
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
        payouts: datedPayouts,
        plan: resolvePlanKey(planKey),
        planKey,
    };
}

function toPlanKey(account: AlertAccountRow): PlanKeyInput {
    return {
        accountSize: account.accountSize,
        firmId: account.firmId,
        optIns: account.optIns,
        planSerial: account.planSerial,
        readIssues: account.readIssues,
    };
}
