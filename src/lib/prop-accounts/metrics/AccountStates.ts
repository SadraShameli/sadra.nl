import type {
    PropAccountEventRow,
    PropAccountRow,
    PropAccountSnapshotRow,
    PropPayoutRow,
} from '~/server/db/schemas/prop';

import {
    type FirmCountMember,
    type FirmCountUnknownReason,
    type FirmPayoutCount,
    type FirmPayoutCountResult,
    FirmPayoutCountResultKind,
    firmPayoutCountResultOf,
    type SnapshotAccountRow,
    type SnapshotEventRow,
    snapshotInputFrom,
    type SnapshotPayoutRow,
    type SnapshotSnapshotRow,
} from '~/lib/prop-accounts/advice';
import {
    type AccountReadIssue,
    isLedgerOnlyAccount,
    latestTwoSnapshots,
    type ModeledAccountRow,
    PlanKeyResolutionKind,
    resolvePlanKey,
    type StoredFirmId,
    trackedAccountOf,
    type UnresolvedPlanReason,
} from '~/lib/prop-accounts/core';
import { type Plan } from '~/lib/prop-calculator';
import {
    AccountReconstruction,
    AccountReconstructionError,
    type ReconstructedAccount,
    type ReconstructionErrorReason,
    snapshotInputIssues,
    SnapshotIssueSeverity,
    type SnapshotPlausibilityIssue,
} from '~/lib/prop-calculator/advisor';

export enum AccountStateKind {
    Reconstructed = 'reconstructed',
    Unavailable = 'unavailable',
}

export enum AccountStateUnavailableKind {
    FirmCountUnknown = 'firm-count-unknown',
    ImplausibleSnapshot = 'implausible-snapshot',
    LedgerOnly = 'ledger-only',
    NoSnapshot = 'no-snapshot',
    ReconstructionError = 'reconstruction-error',
    UnresolvedPlan = 'unresolved-plan',
}

export type AccountStateAccountRow = Pick<
    PropAccountRow,
    'archivedAt' | 'optIns' | 'status' | 'userId'
> &
    SnapshotAccountRow & {
        readonly readIssues: readonly AccountReadIssue[];
    };

export interface AccountStateEntry {
    readonly accountId: string;
    readonly state: AccountStateResult;
}

export type AccountStateEventRow = Pick<
    PropAccountEventRow,
    'accountId' | 'userId'
> &
    SnapshotEventRow;

export type AccountStatePayoutRow = Pick<
    PropPayoutRow,
    'accountId' | 'userId'
> &
    SnapshotPayoutRow;

export type AccountStateResult =
    | {
          readonly kind: AccountStateKind.Reconstructed;
          readonly latest: ReconstructedSnapshotState;
          readonly plan: Plan;
          readonly previous: null | ReconstructedSnapshotState;
      }
    | {
          readonly kind: AccountStateKind.Unavailable;
          readonly reason: AccountStateUnavailableReason;
      };

export type AccountStateSnapshotRow = Pick<
    PropAccountSnapshotRow,
    'accountId' | 'createdAt' | 'id' | 'userId'
> &
    SnapshotSnapshotRow;

export interface AccountStatesRows {
    readonly accounts: readonly AccountStateAccountRow[];
    readonly events: readonly AccountStateEventRow[];
    readonly payouts: readonly AccountStatePayoutRow[];
    readonly snapshots: readonly AccountStateSnapshotRow[];
}

export type AccountStateUnavailableReason =
    | {
          readonly issues: readonly SnapshotPlausibilityIssue[];
          readonly kind: AccountStateUnavailableKind.ImplausibleSnapshot;
      }
    | {
          readonly kind: AccountStateUnavailableKind.FirmCountUnknown;
          readonly reason: FirmCountUnknownReason;
      }
    | { readonly kind: AccountStateUnavailableKind.LedgerOnly }
    | { readonly kind: AccountStateUnavailableKind.NoSnapshot }
    | {
          readonly kind: AccountStateUnavailableKind.ReconstructionError;
          readonly reason: ReconstructionErrorReason;
      }
    | {
          readonly kind: AccountStateUnavailableKind.UnresolvedPlan;
          readonly reason: UnresolvedPlanReason;
      };

export interface ReconstructedSnapshotState {
    readonly asOf: string;
    readonly reconstructed: ReconstructedAccount;
}

type FirmCountAt = (
    firmId: StoredFirmId,
    asOf: string,
) => FirmPayoutCountResult;

interface OwnedRow {
    readonly accountId: string;
    readonly userId: string;
}

type SnapshotAttempt =
    | { readonly ok: false; readonly reason: AccountStateUnavailableReason }
    | { readonly ok: true; readonly value: ReconstructedSnapshotState };

export function accountStatesOf(
    userId: string,
    asOf: string,
    rows: AccountStatesRows,
): readonly AccountStateEntry[] {
    const userAccounts = rows.accounts.filter(
        (account) => account.userId === userId,
    );
    const userAccountIds = new Set(userAccounts.map((account) => account.id));
    const eventsByAccount = groupOwnedRows(rows.events, userId, userAccountIds);
    const payoutsByAccount = groupOwnedRows(
        rows.payouts,
        userId,
        userAccountIds,
    );
    const snapshotsByAccount = groupOwnedRows(
        rows.snapshots,
        userId,
        userAccountIds,
    );
    const firmCountAt = firmCountAtOf(
        userAccounts.map((account): FirmCountMember => ({
            account,
            events: eventsByAccount.get(account.id) ?? [],
            payouts: payoutsByAccount.get(account.id) ?? [],
        })),
    );

    return userAccounts
        .filter((account) => account.archivedAt === null)
        .map((account) => ({
            accountId: account.id,
            state: stateFor(
                account,
                eventsByAccount.get(account.id) ?? [],
                payoutsByAccount.get(account.id) ?? [],
                snapshotsByAccount.get(account.id) ?? [],
                asOf,
                firmCountAt,
            ),
        }));
}

function attemptSnapshot(
    plan: Plan,
    account: ModeledAccountRow<AccountStateAccountRow>,
    snapshot: AccountStateSnapshotRow,
    events: readonly AccountStateEventRow[],
    payouts: readonly AccountStatePayoutRow[],
    asOf: string,
    firmCount: FirmPayoutCount,
): SnapshotAttempt {
    const { input, pendingPayoutCounts, personalMaxRiskPerTrade } =
        snapshotInputFrom(
            plan,
            account,
            snapshot,
            events,
            payouts,
            asOf,
            firmCount,
        );
    const blocking = snapshotInputIssues(plan, input).filter(
        (issue) => issue.severity === SnapshotIssueSeverity.Impossible,
    );
    if (blocking.length > 0) {
        return {
            ok: false,
            reason: {
                issues: blocking,
                kind: AccountStateUnavailableKind.ImplausibleSnapshot,
            },
        };
    }
    try {
        return {
            ok: true,
            value: {
                asOf: input.asOf,
                reconstructed: AccountReconstruction.rebuild(
                    input,
                    plan,
                    personalMaxRiskPerTrade,
                    pendingPayoutCounts,
                ),
            },
        };
    } catch (error) {
        if (error instanceof AccountReconstructionError) {
            return {
                ok: false,
                reason: {
                    kind: AccountStateUnavailableKind.ReconstructionError,
                    reason: error.reason,
                },
            };
        }
        throw error;
    }
}

function firmCountAtOf(members: readonly FirmCountMember[]): FirmCountAt {
    const results = new Map<string, FirmPayoutCountResult>();
    return (firmId, asOf) => {
        const key = `${firmId}|${asOf}`;
        const known = results.get(key);
        if (known !== undefined) return known;
        const result = firmPayoutCountResultOf(firmId, members, asOf);
        results.set(key, result);
        return result;
    };
}

function groupOwnedRows<Row extends OwnedRow>(
    rows: readonly Row[],
    userId: string,
    ownedIds: ReadonlySet<string>,
): ReadonlyMap<string, readonly Row[]> {
    const byAccount = new Map<string, Row[]>();
    for (const row of rows) {
        if (row.userId !== userId || !ownedIds.has(row.accountId)) continue;
        const list = byAccount.get(row.accountId);
        if (list === undefined) {
            byAccount.set(row.accountId, [row]);
        } else {
            list.push(row);
        }
    }
    return byAccount;
}

function stateFor(
    account: AccountStateAccountRow,
    events: readonly AccountStateEventRow[],
    payouts: readonly AccountStatePayoutRow[],
    snapshots: readonly AccountStateSnapshotRow[],
    asOf: string,
    firmCountAt: FirmCountAt,
): AccountStateResult {
    const tracked = trackedAccountOf(account);
    if (isLedgerOnlyAccount(tracked)) {
        return unavailable({ kind: AccountStateUnavailableKind.LedgerOnly });
    }
    const resolution = resolvePlanKey({
        accountSize: tracked.accountSize,
        firmId: tracked.firmId,
        optIns: tracked.optIns,
        planSerial: tracked.planSerial,
        readIssues: tracked.readIssues,
    });
    if (resolution.kind === PlanKeyResolutionKind.Unresolved) {
        return unavailable({
            kind: AccountStateUnavailableKind.UnresolvedPlan,
            reason: resolution.reason,
        });
    }
    const { plan } = resolution;
    const { latest, previous } = latestTwoSnapshots(snapshots);
    if (latest === null) {
        return unavailable({ kind: AccountStateUnavailableKind.NoSnapshot });
    }
    const latestCount = firmCountAt(tracked.firmId, asOf);
    if (latestCount.kind === FirmPayoutCountResultKind.Unknown) {
        return unavailable({
            kind: AccountStateUnavailableKind.FirmCountUnknown,
            reason: latestCount.reason,
        });
    }
    const latestAttempt = attemptSnapshot(
        plan,
        tracked,
        latest,
        events,
        payouts,
        asOf,
        latestCount.count,
    );
    if (!latestAttempt.ok) {
        return unavailable(latestAttempt.reason);
    }
    const previousCount =
        previous === null ? null : firmCountAt(tracked.firmId, previous.asOf);
    const previousAttempt =
        previous === null ||
        previousCount?.kind !== FirmPayoutCountResultKind.Known
            ? null
            : attemptSnapshot(
                  plan,
                  tracked,
                  previous,
                  events,
                  payouts,
                  previous.asOf,
                  previousCount.count,
              );
    return {
        kind: AccountStateKind.Reconstructed,
        latest: latestAttempt.value,
        plan,
        previous: previousAttempt?.ok === true ? previousAttempt.value : null,
    };
}

function unavailable(
    reason: AccountStateUnavailableReason,
): AccountStateResult {
    return { kind: AccountStateKind.Unavailable, reason };
}
