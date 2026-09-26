import type { z } from 'zod';

import type { PropAccountRow } from '~/server/db/schemas/prop';

import {
    type AccountAlert,
    type AccountReadIssue,
    AccountReadIssueKind,
    type AccountStage,
    AccountStatus,
    AlertEvaluator,
    AlertSubjectKind,
    compareText,
    createAlertContext,
    describeAccountReadIssue,
    type PlanKeyInput,
    type PlanKeyResolution,
    PlanKeyResolutionKind,
    resolvePlanKey,
    type StoredFirmId,
    UnresolvablePlanRule,
    UnresolvedPlanReason,
    type UsdCents,
    usdCents,
} from '~/lib/prop-accounts';
import { type FirmId } from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';
import {
    type propAccountSnapshotOutputSchema,
    STORED_DATA_OWNER_REPAIR,
} from '~/lib/schemas/propAccountOutputs';

export enum AccountSortKey {
    Cushion = 'cushion',
    Label = 'label',
    Readiness = 'readiness',
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
    | 'id'
    | 'label'
    | 'notes'
    | 'optIns'
    | 'planSerial'
    | 'purchasedOn'
    | 'stage'
    | 'status'
    | 'tags'
> & {
    readonly firmId: StoredFirmId;
    readonly readIssues: readonly AccountReadIssue[];
};

export interface AccountListFilters {
    readonly copyGroupId: null | string;
    readonly firmId: FirmId | null;
    readonly includeArchived: boolean;
    readonly stage: AccountStage | null;
    readonly status: AccountStatus | null;
    readonly tag: null | string;
}

export interface AccountListRow {
    readonly account: AccountListAccount;
    readonly cushionCents: null | UsdCents;
    readonly isReadOnly: boolean;
    readonly latestSnapshot: AccountListSnapshot | null;
    readonly plan: PlanKeyResolution;
    readonly planIssue: null | string;
    readonly readiness: null | number;
    readonly readOnlyNotice: null | string;
}

export type AccountListSnapshot = Pick<
    z.output<typeof propAccountSnapshotOutputSchema>,
    'accountId' | 'asOf' | 'balanceCents' | 'createdAt' | 'dashboardFloorCents'
>;

export interface AccountListSort {
    readonly direction: SortDirection;
    readonly key: AccountSortKey;
}

export const ACCOUNT_LIST_INPUT = { includeArchived: true } as const;

export const DEFAULT_ACCOUNT_LIST_FILTERS: AccountListFilters = {
    copyGroupId: null,
    firmId: null,
    includeArchived: false,
    stage: null,
    status: null,
    tag: null,
};

export const DEFAULT_ACCOUNT_LIST_SORT: AccountListSort = {
    direction: SortDirection.Ascending,
    key: AccountSortKey.Label,
};

const STATUS_LABEL: Readonly<Record<AccountStatus, string>> = {
    [AccountStatus.Active]: 'Active',
    [AccountStatus.Busted]: 'Busted',
    [AccountStatus.Closed]: 'Closed',
    [AccountStatus.Concluded]: 'Concluded',
    [AccountStatus.Suspended]: 'Suspended',
};

const READ_ONLY_CLOSING =
    'While it is read-only, the account cannot be edited here and gets no sizing advice. Archiving keeps its payouts and fees in your totals; deleting it removes its balances, payouts, fees and events for good.';

const REPAIR_OR_REPLACE = `${STORED_DATA_OWNER_REPAIR}, or archive it and add it again as a new account`;

const UNRESOLVABLE_PLAN_EVALUATOR = new AlertEvaluator([
    new UnresolvablePlanRule(),
]);

const LABEL_COLLATOR = new Intl.Collator('en', { sensitivity: 'base' });

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
            return { key: `${alert.kind}-${subject.kind}`, label: 'Portfolio' };
        }
    }
}

export function buildAccountListRows(
    accounts: readonly AccountListAccount[],
    snapshots: readonly AccountListSnapshot[],
): readonly AccountListRow[] {
    const latest = new Map<string, AccountListSnapshot>();
    for (const snapshot of snapshots) {
        const current = latest.get(snapshot.accountId);
        if (current === undefined || compareSnapshots(snapshot, current) > 0) {
            latest.set(snapshot.accountId, snapshot);
        }
    }
    return accounts.map((account) => {
        const plan = resolvePlanKey(account);
        const issues = readIssuesOf(account, plan);
        const latestSnapshot = latest.get(account.id) ?? null;
        return {
            account,
            cushionCents: cushionOf(latestSnapshot),
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
            readiness: null,
            readOnlyNotice:
                issues.length === 0
                    ? null
                    : readOnlyAccountNotice(account, issues),
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
            filters.firmId === null || account.firmId === filters.firmId,
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
    key: PlanKeyInput,
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
            case AccountSortKey.Label: {
                return sign * compareLabels(left, right);
            }
            case AccountSortKey.Readiness: {
                return (
                    compareKnownFirst(left.readiness, right.readiness, sign) ||
                    compareLabels(left, right)
                );
            }
        }
    });
}

export function unresolvablePlanAlerts(
    accounts: readonly AccountListAccount[],
    today: string,
): readonly AccountAlert[] {
    return UNRESOLVABLE_PLAN_EVALUATOR.evaluate(
        createAlertContext({
            accounts,
            copyGroups: [],
            payouts: [],
            rulebook: DEFAULT_RULEBOOK,
            snapshots: [],
            today,
        }),
    );
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

function compareSnapshots(
    left: AccountListSnapshot,
    right: AccountListSnapshot,
): number {
    return (
        compareText(left.asOf, right.asOf) ||
        left.createdAt.getTime() - right.createdAt.getTime()
    );
}

function cushionOf(snapshot: AccountListSnapshot | null): null | UsdCents {
    const floor = snapshot?.dashboardFloorCents ?? null;
    return snapshot === null || floor === null
        ? null
        : usdCents(snapshot.balanceCents - floor);
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
