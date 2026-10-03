import type { z } from 'zod';

import type { PropAccountRow } from '~/server/db/schemas/prop';

import {
    type AccountAlert,
    type AccountReadIssue,
    AccountReadIssueKind,
    type AccountStage,
    AccountStatus,
    AccountTracking,
    AlertSubjectKind,
    compareSnapshots,
    compareText,
    type CushionBoard,
    describeAccountReadIssue,
    type ExternalFirmName,
    type FirmKey,
    firmKeyId,
    firmKeyLabel,
    firmKeyOf,
    type LedgerOnlyPlanKey,
    type PayoutReadinessBoard,
    type PayoutReadinessRow,
    PayoutReadinessRowKind,
    type PlanKeyInput,
    type PlanKeyResolution,
    PlanKeyResolutionKind,
    resolvePlanKey,
    trackedAccountOf,
    type TrackedAccountRow,
    type TrackedColumns,
    UnresolvedPlanReason,
    type UsdCents,
    usdCents,
} from '~/lib/prop-accounts';
import {
    PayoutBlockReasonKind,
    PayoutWaitBasis,
} from '~/lib/prop-calculator/advisor';
import {
    type propAccountSnapshotOutputSchema,
    STORED_DATA_OWNER_REPAIR,
} from '~/lib/schemas/propAccountOutputs';

export enum AccountSortKey {
    Cushion = 'cushion',
    ExpectedValue = 'expected-value',
    Label = 'label',
    Readiness = 'readiness',
}

export enum PayoutReadinessTier {
    Blocked = 'blocked',
    Eligible = 'eligible',
    Waiting = 'waiting',
}

export enum SortDirection {
    Ascending = 'ascending',
    Descending = 'descending',
}

export interface AccountAlertSubjectView {
    readonly key: string;
    readonly label: string;
}

export type AccountListAccount = Pick<
    PropAccountRow,
    | 'accountSize'
    | 'archivedAt'
    | 'copyGroupId'
    | 'dashboardConvention'
    | 'externalFirmId'
    | 'firmId'
    | 'firstFundedTradeOn'
    | 'id'
    | 'label'
    | 'liveStartBalanceCents'
    | 'notes'
    | 'optIns'
    | 'planLabel'
    | 'planSerial'
    | 'purchasedOn'
    | 'stage'
    | 'status'
    | 'tags'
    | 'tracking'
> & {
    readonly hasCorruptTags?: boolean;
    readonly readIssues: readonly AccountReadIssue[];
};

export interface AccountListBoards {
    readonly cushion: CushionBoard;
    readonly readiness: PayoutReadinessBoard;
}

export interface AccountListFilters {
    readonly copyGroupId: null | string;
    readonly firmKey: FirmKey | null;
    readonly includeArchived: boolean;
    readonly stage: AccountStage | null;
    readonly status: AccountStatus | null;
    readonly tag: null | string;
}

export interface AccountListRow {
    readonly account: TrackedAccountRow<AccountListAccount>;
    readonly cushionCents: null | UsdCents;
    readonly expectedValueDollars: null | number;
    readonly isLedgerOnly: boolean;
    readonly isReadOnly: boolean;
    readonly latestSnapshot: AccountListSnapshot | null;
    readonly plan: PlanKeyResolution;
    readonly planIssue: null | string;
    readonly readiness: null | PayoutReadinessTier;
    readonly readOnlyNotice: null | string;
    readonly tagsNotice: null | string;
}

export type AccountListSnapshot = Pick<
    z.output<typeof propAccountSnapshotOutputSchema>,
    | 'accountId'
    | 'asOf'
    | 'balanceCents'
    | 'createdAt'
    | 'dashboardFloorCents'
    | 'id'
>;

export interface AccountListSort {
    readonly direction: SortDirection;
    readonly key: AccountSortKey;
}

export type PlanLabelColumns = Pick<PropAccountRow, 'accountSize' | 'optIns'> &
    TrackedColumns & { readonly readIssues: readonly AccountReadIssue[] };

export const ACCOUNT_LIST_INPUT = { includeArchived: true } as const;

export const DEFAULT_ACCOUNT_LIST_FILTERS: AccountListFilters = {
    copyGroupId: null,
    firmKey: null,
    includeArchived: false,
    stage: null,
    status: null,
    tag: null,
};

export const DEFAULT_ACCOUNT_LIST_SORT: AccountListSort = {
    direction: SortDirection.Descending,
    key: AccountSortKey.ExpectedValue,
};

const NO_EXPECTED_VALUES: ReadonlyMap<string, null | number> = new Map();

const READINESS_TIER_RANK: Readonly<Record<PayoutReadinessTier, number>> = {
    [PayoutReadinessTier.Blocked]: 2,
    [PayoutReadinessTier.Eligible]: 0,
    [PayoutReadinessTier.Waiting]: 1,
};

const STATUS_LABEL: Readonly<Record<AccountStatus, string>> = {
    [AccountStatus.Active]: 'Active',
    [AccountStatus.Busted]: 'Busted',
    [AccountStatus.Closed]: 'Closed',
    [AccountStatus.Concluded]: 'Concluded',
    [AccountStatus.Suspended]: 'Suspended',
};

const CORRUPT_TAGS_NOTICE =
    'The saved tags of this account cannot be read, so they show as none. Saving the account with at least one tag replaces them.';

const READ_ONLY_CLOSING =
    'While it is read-only, the account cannot be edited here and gets no sizing advice. Archiving keeps its payouts and fees in your totals; deleting it removes its balances, payouts, fees and events for good.';

const REPAIR_OR_REPLACE = `${STORED_DATA_OWNER_REPAIR}, or archive it and add it again as a new account`;

const LABEL_COLLATOR = new Intl.Collator('en', { sensitivity: 'base' });

export function accountFirmLabel(
    account: TrackedAccountRow<Pick<PropAccountRow, keyof TrackedColumns>>,
    externalFirms: readonly ExternalFirmName[],
): string {
    return firmKeyLabel(firmKeyOf(account), externalFirms);
}

export function accountPlanLabel<Row extends PlanLabelColumns>(
    account: TrackedAccountRow<Row>,
): string {
    if (account.tracking === AccountTracking.LedgerOnly) {
        return account.planLabel;
    }
    const resolution = resolvePlanKey(account);
    return resolution.kind === PlanKeyResolutionKind.Resolved
        ? resolution.plan.label
        : account.planSerial;
}

export function accountStatusLabel(status: AccountStatus): string {
    return STATUS_LABEL[status];
}

export function accountTagOptions(
    accounts: readonly AccountListAccount[],
): readonly string[] {
    return [...new Set(accounts.flatMap((account) => account.tags))].toSorted(
        compareText,
    );
}

export function alertSubjectView(alert: AccountAlert): AccountAlertSubjectView {
    const { subject } = alert;
    switch (subject.kind) {
        case AlertSubjectKind.Account: {
            return {
                key: `${alert.kind}-${subject.kind}-${subject.accountId}`,
                label: subject.label,
            };
        }
        case AlertSubjectKind.CopyGroup: {
            return {
                key: `${alert.kind}-${subject.kind}-${subject.copyGroupId}`,
                label: subject.name,
            };
        }
        case AlertSubjectKind.Portfolio: {
            return {
                key: [
                    alert.kind,
                    subject.kind,
                    subject.accountIds.toSorted(compareText).join('+'),
                    alert.message,
                ].join('-'),
                label: 'Portfolio',
            };
        }
    }
}

export function buildAccountListRows(
    accounts: readonly AccountListAccount[],
    snapshots: readonly AccountListSnapshot[],
    boards: AccountListBoards | null = null,
    expectedValues: ReadonlyMap<string, null | number> = NO_EXPECTED_VALUES,
): readonly AccountListRow[] {
    const cushions = new Map(
        boards?.cushion.rows.map((row) => [row.accountId, row.cushionCents]),
    );
    const readiness = new Map(
        boards?.readiness.rows.map((row) => [row.accountId, row]),
    );
    const latest = new Map<string, AccountListSnapshot>();
    for (const snapshot of snapshots) {
        const current = latest.get(snapshot.accountId);
        if (current === undefined || compareSnapshots(snapshot, current) > 0) {
            latest.set(snapshot.accountId, snapshot);
        }
    }
    return accounts.map((stored) => {
        const account = trackedAccountOf(stored);
        const plan = resolvePlanKey(account);
        const issues = readIssuesOf(account, plan);
        const latestSnapshot = latest.get(account.id) ?? null;
        return {
            account,
            cushionCents:
                boards === null
                    ? cushionOf(latestSnapshot)
                    : (cushions.get(account.id) ?? null),
            expectedValueDollars: expectedValues.get(account.id) ?? null,
            isLedgerOnly: account.tracking === AccountTracking.LedgerOnly,
            isReadOnly: issues.length > 0,
            latestSnapshot,
            plan,
            planIssue:
                issues.length === 0
                    ? null
                    : issues
                          .map((issue) =>
                              describeAccountReadIssue(account, issue),
                          )
                          .join('; '),
            readiness: readinessTierOf(readiness.get(account.id)),
            readOnlyNotice:
                issues.length === 0
                    ? null
                    : readOnlyAccountNotice(account, issues),
            tagsNotice:
                account.hasCorruptTags === true ? CORRUPT_TAGS_NOTICE : null,
        };
    });
}

export function filterAccountRows(
    rows: readonly AccountListRow[],
    filters: AccountListFilters,
): readonly AccountListRow[] {
    return rows.filter(({ account }) =>
        [
            filters.includeArchived || account.archivedAt === null,
            filters.firmKey === null ||
                firmKeyId(firmKeyOf(account)) === firmKeyId(filters.firmKey),
            filters.stage === null || account.stage === filters.stage,
            filters.status === null || account.status === filters.status,
            filters.copyGroupId === null ||
                account.copyGroupId === filters.copyGroupId,
            filters.tag === null || account.tags.includes(filters.tag),
        ].every(Boolean),
    );
}

export function readIssuesOf(
    account: Pick<AccountListAccount, 'readIssues'>,
    plan: PlanKeyResolution,
): readonly AccountReadIssue[] {
    const isPlanFlagged = account.readIssues.some(
        (issue) => issue.kind === AccountReadIssueKind.UnresolvablePlan,
    );
    return !isPlanFlagged && plan.kind === PlanKeyResolutionKind.Unresolved
        ? [
              ...account.readIssues,
              {
                  kind: AccountReadIssueKind.UnresolvablePlan,
                  reason: plan.reason,
              },
          ]
        : account.readIssues;
}

export function readOnlyAccountNotice(
    key: LedgerOnlyPlanKey | PlanKeyInput,
    issues: readonly AccountReadIssue[],
): string {
    return [
        ...issues.map(
            (issue) =>
                `${describeAccountReadIssue(key, issue)}. ${readOnlyExplanation(issue)}`,
        ),
        READ_ONLY_CLOSING,
    ].join(' ');
}

export function readOnlyAlertTitle(label: string): string {
    return `Read-only account: ${label}`;
}

export function sortAccountRows(
    rows: readonly AccountListRow[],
    sort: AccountListSort,
): readonly AccountListRow[] {
    const sign = sort.direction === SortDirection.Ascending ? 1 : -1;
    return rows.toSorted((left, right) => {
        switch (sort.key) {
            case AccountSortKey.Cushion: {
                return (
                    compareKnownFirst(
                        left.cushionCents,
                        right.cushionCents,
                        sign,
                    ) || compareLabels(left, right)
                );
            }
            case AccountSortKey.ExpectedValue: {
                return (
                    compareKnownFirst(
                        left.expectedValueDollars,
                        right.expectedValueDollars,
                        sign,
                    ) ||
                    compareKnownFirst(
                        readinessRankOf(left.readiness),
                        readinessRankOf(right.readiness),
                        1,
                    ) ||
                    compareLabels(left, right)
                );
            }
            case AccountSortKey.Label: {
                return sign * compareLabels(left, right);
            }
            case AccountSortKey.Readiness: {
                return (
                    compareKnownFirst(
                        readinessRankOf(left.readiness),
                        readinessRankOf(right.readiness),
                        sign,
                    ) || compareLabels(left, right)
                );
            }
        }
    });
}

function compareKnownFirst(
    left: null | number,
    right: null | number,
    sign: number,
): number {
    return left === null || right === null
        ? Number(left === null) - Number(right === null)
        : sign * (left - right);
}

function compareLabels(left: AccountListRow, right: AccountListRow): number {
    return (
        LABEL_COLLATOR.compare(left.account.label, right.account.label) ||
        compareText(left.account.id, right.account.id)
    );
}

function cushionOf(snapshot: AccountListSnapshot | null): null | UsdCents {
    const floor = snapshot?.dashboardFloorCents ?? null;
    return snapshot === null || floor === null
        ? null
        : usdCents(snapshot.balanceCents - floor);
}

function readinessRankOf(tier: null | PayoutReadinessTier): null | number {
    return tier === null ? null : READINESS_TIER_RANK[tier];
}

function readinessTierOf(
    row: PayoutReadinessRow | undefined,
): null | PayoutReadinessTier {
    if (row === undefined) return null;
    switch (row.kind) {
        case PayoutReadinessRowKind.Blocked: {
            return row.reason.kind === PayoutBlockReasonKind.PayoutPending ||
                (row.wait !== null &&
                    row.wait.basis !== PayoutWaitBasis.NoClosedForm)
                ? PayoutReadinessTier.Waiting
                : PayoutReadinessTier.Blocked;
        }
        case PayoutReadinessRowKind.Eligible: {
            return PayoutReadinessTier.Eligible;
        }
    }
}

function readOnlyExplanation(issue: AccountReadIssue): string {
    switch (issue.kind) {
        case AccountReadIssueKind.CorruptPersonalRules: {
            return `Its saved caps and limits cannot be read, and showing them as unset would hide rules you set. ${STORED_DATA_OWNER_REPAIR}.`;
        }
        case AccountReadIssueKind.UnresolvablePlan: {
            return unresolvedPlanExplanation(issue.reason);
        }
    }
}

function unresolvedPlanExplanation(reason: UnresolvedPlanReason): string {
    switch (reason) {
        case UnresolvedPlanReason.AccountSizeMismatch: {
            return `The stored account size disagrees with the size of its plan, so the plan rules cannot be applied safely. ${REPAIR_OR_REPLACE} with the plan's account size.`;
        }
        case UnresolvedPlanReason.CorruptOptIns: {
            return `Its saved funded reset and early withdrawal choices cannot be read, and guessing them could change the plan rules. ${REPAIR_OR_REPLACE} with the right opt-ins.`;
        }
        case UnresolvedPlanReason.OptInNotOffered: {
            return `The plan does not offer an opt-in this account took (the firm may have dropped it), so its rules with that opt-in are not known. ${REPAIR_OR_REPLACE} without that opt-in.`;
        }
        case UnresolvedPlanReason.UnknownFirm: {
            return 'This firm is no longer modeled.';
        }
        case UnresolvedPlanReason.UnknownPlanSerial: {
            return 'This plan is no longer modeled.';
        }
    }
}
