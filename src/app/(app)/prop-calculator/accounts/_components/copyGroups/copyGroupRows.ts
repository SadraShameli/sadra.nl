import type { PropCopyGroupRow } from '~/server/db/schemas/prop';

import {
    type AccountListAccount,
    accountStatusLabel,
} from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import {
    type AccountStage,
    accountStageBreakdown,
    accountStageLabel,
    AccountStatus,
    compareText,
    findStoredFirm,
    hasMixedStages,
    isActiveAccount,
    isModeledAccount,
    type ModeledAccountRow,
    type StageCount,
    stageCountsOf,
    trackedAccountOf,
} from '~/lib/prop-accounts';
import {
    copyGroupCreateSchema,
    MAX_ACCOUNT_LABEL_LENGTH,
} from '~/lib/schemas/propAccounts';

export type CopyGroupAccount = Pick<
    AccountListAccount,
    | 'archivedAt'
    | 'copyGroupId'
    | 'externalFirmId'
    | 'firmId'
    | 'id'
    | 'label'
    | 'planLabel'
    | 'planSerial'
    | 'stage'
    | 'status'
    | 'tracking'
>;

export interface CopyGroupMember {
    readonly firmName: string;
    readonly id: string;
    readonly isArchived: boolean;
    readonly label: string;
    readonly stage: AccountStage;
    readonly stageLabel: string;
    readonly status: AccountStatus;
}

export interface CopyGroupOverview {
    readonly groups: readonly CopyGroupRow[];
    readonly unassigned: readonly CopyGroupMember[];
}

export type CopyGroupRecord = Pick<PropCopyGroupRow, 'id' | 'name' | 'notes'>;

export interface CopyGroupRow {
    readonly firmNames: readonly string[];
    readonly group: CopyGroupRecord;
    readonly isMixedStage: boolean;
    readonly members: readonly CopyGroupMember[];
    readonly otherMembers: readonly CopyGroupMember[];
    readonly stage: AccountStage | null;
    readonly stageCounts: readonly StageCount[];
    readonly stageSummary: string;
}

export interface CopyGroupStageRoster {
    readonly members: readonly CopyGroupMember[];
    readonly stage: AccountStage;
    readonly stageLabel: string;
}

interface CopyGroupEntry {
    readonly copyGroupId: null | string;
    readonly isActive: boolean;
    readonly member: CopyGroupMember;
}

const NAME_REQUIRED = 'Enter a group name.';
const NAME_TOO_LONG = `Keep the group name to ${MAX_ACCOUNT_LABEL_LENGTH} characters or fewer.`;
const NO_ACTIVE_MEMBERS = 'No active members';

export function copyGroupNameError(name: string): null | string {
    const parsed = copyGroupCreateSchema.shape.name.safeParse(name);
    if (parsed.success) return null;
    const [issue] = parsed.error.issues;
    if (issue === undefined || issue.code === 'too_small') return NAME_REQUIRED;
    return issue.code === 'too_big'
        ? NAME_TOO_LONG
        : `The group name ${issue.message}.`;
}

export function copyGroupRows(
    groups: readonly CopyGroupRecord[],
    accounts: readonly CopyGroupAccount[],
): CopyGroupOverview {
    const entries = accounts
        .map((account) => trackedAccountOf(account))
        .filter((account) => isModeledAccount(account))
        .map((account): CopyGroupEntry => ({
            copyGroupId: account.copyGroupId,
            isActive: isActiveAccount(account),
            member: memberOf(account),
        }))
        .toSorted((left, right) => compareMembers(left.member, right.member));
    const entriesIn = (copyGroupId: null | string) =>
        entries.filter((entry) => entry.copyGroupId === copyGroupId);
    return {
        groups: groups.map((group) => groupRow(group, entriesIn(group.id))),
        unassigned: membersOf(entriesIn(null), true),
    };
}

export function memberStateLabel(member: CopyGroupMember): null | string {
    if (member.isArchived) return 'archived';
    return member.status === AccountStatus.Active
        ? null
        : accountStatusLabel(member.status).toLowerCase();
}

export function stageConflictsOf(
    row: CopyGroupRow,
    stage: AccountStage,
): readonly CopyGroupMember[] {
    return [...row.members, ...row.otherMembers]
        .filter((member) => member.stage !== stage)
        .toSorted(compareMembers);
}

export function stageRosterOf(
    members: readonly CopyGroupMember[],
): readonly CopyGroupStageRoster[] {
    return stageCountsOf(members.map((member) => member.stage)).map(
        ({ stage }) => ({
            members: members.filter((member) => member.stage === stage),
            stage,
            stageLabel: accountStageLabel(stage),
        }),
    );
}

function compareMembers(left: CopyGroupMember, right: CopyGroupMember) {
    return (
        compareText(left.label, right.label) || compareText(left.id, right.id)
    );
}

function groupRow(
    group: CopyGroupRecord,
    grouped: readonly CopyGroupEntry[],
): CopyGroupRow {
    const members = membersOf(grouped, true);
    const stages = members.map((member) => member.stage);
    const stageCounts = stageCountsOf(stages);
    const isMixedStage = hasMixedStages(stages);
    return {
        firmNames: [
            ...new Set(members.map((member) => member.firmName)),
        ].toSorted(compareText),
        group,
        isMixedStage,
        members,
        otherMembers: membersOf(grouped, false),
        stage: isMixedStage ? null : (stageCounts[0]?.stage ?? null),
        stageCounts,
        stageSummary:
            stageCounts.length === 0
                ? NO_ACTIVE_MEMBERS
                : accountStageBreakdown(stageCounts),
    };
}

function memberOf(
    account: ModeledAccountRow<CopyGroupAccount>,
): CopyGroupMember {
    return {
        firmName: findStoredFirm(account.firmId)?.displayName ?? account.firmId,
        id: account.id,
        isArchived: account.archivedAt !== null,
        label: account.label,
        stage: account.stage,
        stageLabel: accountStageLabel(account.stage),
        status: account.status,
    };
}

function membersOf(
    entries: readonly CopyGroupEntry[],
    isActive: boolean,
): readonly CopyGroupMember[] {
    return entries
        .filter((entry) => entry.isActive === isActive)
        .map((entry) => entry.member);
}
