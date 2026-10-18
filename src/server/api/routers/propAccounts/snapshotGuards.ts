import { and, eq, inArray } from 'drizzle-orm';
import 'server-only';

import {
    type AccountStage,
    accountStageLabel,
    checkSnapshotEntry,
    compareText,
    type MissingSnapshotField,
    missingSnapshotFields,
    type SnapshotEntryAccount,
    snapshotEntryIssueMessage,
    type SnapshotEntryValues,
    snapshotFieldRules,
} from '~/lib/prop-accounts';
import {
    type OwnedAccount,
    PROP_QUOTA_LIMITS,
    type PropDatabase,
} from '~/lib/prop-accounts/server';
import { type Plan } from '~/lib/prop-calculator';
import { type SnapshotPlausibilityIssue } from '~/lib/prop-calculator/advisor';
import {
    PropMutationRejection,
    PropQuota,
} from '~/lib/schemas/propAccountOutputs';
import { propAccountSnapshot } from '~/server/db/schemas/prop';

import { PropMutationRejectionError } from './mutationGuard';

export interface StagedSnapshot {
    readonly account: Pick<OwnedAccount, 'label'> & SnapshotEntryAccount;
    readonly plan: Plan;
    readonly snapshot: StagedSnapshotEntry;
    readonly stage: AccountStage;
}

export interface StagedSnapshotEntry extends SnapshotEntryValues {
    readonly accountId: string;
    readonly asOf: string;
}

interface ImplausibleEntry {
    readonly issues: readonly SnapshotPlausibilityIssue[];
    readonly staged: StagedSnapshot;
}

interface SnapshotGap {
    readonly missing: readonly string[];
    readonly staged: StagedSnapshot;
}

export async function assertNotStored(
    database: PropDatabase,
    userId: string,
    input: readonly StagedSnapshotEntry[],
    accounts: ReadonlyMap<string, Pick<OwnedAccount, 'label'>>,
): Promise<void> {
    const accountIds = [
        ...new Set(input.map((snapshot) => snapshot.accountId)),
    ];
    const dates = [...new Set(input.map((snapshot) => snapshot.asOf))];
    const stored = await database
        .select({
            accountId: propAccountSnapshot.accountId,
            asOf: propAccountSnapshot.asOf,
        })
        .from(propAccountSnapshot)
        .where(
            and(
                eq(propAccountSnapshot.userId, userId),
                inArray(propAccountSnapshot.accountId, accountIds),
                inArray(propAccountSnapshot.asOf, dates),
            ),
        )
        .limit(PROP_QUOTA_LIMITS[PropQuota.Snapshots]);
    const storedKeys = new Set(
        stored.map((row) => snapshotKey(row.accountId, row.asOf)),
    );
    const duplicate = input.find((snapshot) =>
        storedKeys.has(snapshotKey(snapshot.accountId, snapshot.asOf)),
    );
    if (duplicate === undefined) return;
    throw new PropMutationRejectionError(
        PropMutationRejection.DuplicateSnapshot,
        `A snapshot for "${accountLabelOf(accounts, duplicate.accountId)}" on ${duplicate.asOf} is already stored; remove it first or use another date`,
    );
}

export function assertPlausible(
    staged: readonly StagedSnapshot[],
    remedy: string,
): void {
    const implausible = staged.flatMap((entry): ImplausibleEntry[] => {
        const { blocking } = checkSnapshotEntry(
            entry.plan,
            entry.stage,
            entry.account,
            entry.snapshot,
        );
        return blocking.length === 0
            ? []
            : [{ issues: blocking, staged: entry }];
    });
    const [first] = implausible;
    if (first === undefined) return;
    const { account, snapshot, stage } = first.staged;
    const others =
        implausible.length > 1
            ? ` (and ${String(implausible.length - 1)} more implausible snapshots)`
            : '';
    throw new PropMutationRejectionError(
        PropMutationRejection.ImplausibleSnapshot,
        `The snapshot for "${account.label}" on ${snapshot.asOf} does not fit the account in the ${accountStageLabel(stage)} stage: ${first.issues.map(snapshotEntryIssueMessage).join(' ')}${others}${remedy}`,
    );
}

export function assertRequiredFields(
    staged: readonly StagedSnapshot[],
    remedy: string,
): void {
    const gaps = staged.flatMap((entry): SnapshotGap[] => {
        const missing = missingFieldLabels(
            missingSnapshotFields(
                snapshotFieldRules(entry.plan, entry.stage),
                (field) => entry.snapshot[field] !== null,
            ),
        );
        return missing.length > 0 ? [{ missing, staged: entry }] : [];
    });
    const [first] = gaps;
    if (first === undefined) return;
    const { account, snapshot, stage } = first.staged;
    const others =
        gaps.length > 1
            ? ` (and ${String(gaps.length - 1)} more snapshots with missing fields)`
            : '';
    throw new PropMutationRejectionError(
        PropMutationRejection.MissingSnapshotField,
        `The snapshot for "${account.label}" on ${snapshot.asOf} needs what its plan requires in the ${accountStageLabel(stage)} stage: ${first.missing.join('; ')}${others}${remedy}`,
    );
}

function accountLabelOf(
    accounts: ReadonlyMap<string, Pick<OwnedAccount, 'label'>>,
    accountId: string,
): string {
    return accounts.get(accountId)?.label ?? accountId;
}

function missingFieldLabels(
    missing: readonly MissingSnapshotField[],
): string[] {
    return [
        ...new Set(
            missing.map((field) =>
                field.alternative === null
                    ? field.label
                    : [field.label, field.alternative.label]
                          .toSorted(compareText)
                          .join(' or '),
            ),
        ),
    ];
}

function snapshotKey(accountId: string, asOf: string): string {
    return `${accountId} ${asOf}`;
}
