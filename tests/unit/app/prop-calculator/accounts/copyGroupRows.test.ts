import { describe, expect, it } from 'vitest';

import {
    type CopyGroupAccount,
    copyGroupNameError,
    copyGroupRows,
    memberStateLabel,
    stageConflictsOf,
    stageRosterOf,
} from '~/app/(app)/prop-calculator/accounts/_components/copyGroups/copyGroupRows';
import {
    AccountStage,
    AccountStatus,
    compareText,
    createAlertContext,
    isActiveAccount,
} from '~/lib/prop-accounts';
import { hasMixedStages, stageCountsOf } from '~/lib/prop-accounts/alerts';
import { isActive } from '~/lib/prop-accounts/alerts/AlertContext';
import { ALL_FIRMS, serializePlanId } from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';
import { MAX_ACCOUNT_LABEL_LENGTH } from '~/lib/schemas/propAccounts';

const FIRST_FIRM = modeledFirm(0);
const SECOND_FIRM = modeledFirm(1);

const MAIN = { id: 'group-main', name: 'Main copy', notes: null };
const SPARE = { id: 'group-spare', name: 'Spare', notes: 'weekend only' };

function account(
    id: string,
    overrides: Partial<CopyGroupAccount> = {},
): CopyGroupAccount {
    return {
        archivedAt: null,
        copyGroupId: null,
        firmId: FIRST_FIRM.id,
        id,
        label: id,
        stage: AccountStage.Funded,
        status: AccountStatus.Active,
        ...overrides,
    };
}

function modeledFirm(index: number) {
    const firm = ALL_FIRMS[index];
    if (firm === undefined) throw new Error(`no modeled firm at ${index}`);
    return firm;
}

describe('the stage-grouping predicate exported by MixedStageCopyGroupRule', () => {
    it('counts each stage present, in stage order', () => {
        expect(
            stageCountsOf([
                AccountStage.Funded,
                AccountStage.Eval,
                AccountStage.Funded,
            ]),
        ).toEqual([
            { count: 1, stage: AccountStage.Eval },
            { count: 2, stage: AccountStage.Funded },
        ]);
        expect(stageCountsOf([])).toEqual([]);
    });

    it('is true only when more than one stage is present', () => {
        expect(hasMixedStages([])).toBe(false);
        expect(hasMixedStages([AccountStage.Live, AccountStage.Live])).toBe(
            false,
        );
        expect(hasMixedStages([AccountStage.Live, AccountStage.Funded])).toBe(
            true,
        );
    });
});

describe('the one active-account predicate', () => {
    const ARCHIVED_AT = new Date('2026-09-01T00:00:00Z');
    const STATES: readonly [string, Partial<CopyGroupAccount>, boolean][] = [
        ['active', {}, true],
        ['archived', { archivedAt: ARCHIVED_AT }, false],
        ['busted', { status: AccountStatus.Busted }, false],
        ['closed', { status: AccountStatus.Closed }, false],
        ['suspended', { status: AccountStatus.Suspended }, false],
        ['concluded', { status: AccountStatus.Concluded }, false],
        [
            'archived and busted',
            { archivedAt: ARCHIVED_AT, status: AccountStatus.Busted },
            false,
        ],
    ];

    function isActiveInAlerts(row: CopyGroupAccount): boolean {
        const [plan] = FIRST_FIRM.plans;
        if (plan === undefined) throw new Error('a modeled plan is needed');
        const context = createAlertContext({
            accounts: [
                {
                    accountSize: plan.id.accountSize,
                    archivedAt: row.archivedAt,
                    copyGroupId: row.copyGroupId,
                    firmId: row.firmId,
                    id: row.id,
                    label: row.label,
                    optIns: {},
                    planSerial: serializePlanId(plan.id),
                    purchasedOn: '2026-09-01',
                    readIssues: [],
                    stage: row.stage,
                    status: row.status,
                },
            ],
            copyGroups: [],
            payouts: [],
            rulebook: DEFAULT_RULEBOOK,
            snapshots: [],
            today: '2026-09-23',
        });
        return context.accounts.some(
            (monitored) =>
                monitored.account.id === row.id && isActive(monitored),
        );
    }

    it('agrees across the ledger, the copy-group page and the alerts for every account state', () => {
        for (const [name, overrides, isExpectedActive] of STATES) {
            const grouped = account(name, {
                copyGroupId: MAIN.id,
                ...overrides,
            });
            const loose = { ...grouped, copyGroupId: null };
            const [row] = copyGroupRows([MAIN], [grouped]).groups;
            expect([name, isActiveAccount(grouped)]).toEqual([
                name,
                isExpectedActive,
            ]);
            expect([name, row?.members.length === 1]).toEqual([
                name,
                isExpectedActive,
            ]);
            expect([name, row?.otherMembers.length === 1]).toEqual([
                name,
                !isExpectedActive,
            ]);
            expect([
                name,
                copyGroupRows([MAIN], [loose]).unassigned.length === 1,
            ]).toEqual([name, isExpectedActive]);
            expect([name, isActiveInAlerts(grouped)]).toEqual([
                name,
                isExpectedActive,
            ]);
        }
    });
});

describe('copyGroupRows', () => {
    it('lists each group with its active members, their stages and firms', () => {
        const overview = copyGroupRows(
            [MAIN, SPARE],
            [
                account('b-funded', {
                    copyGroupId: MAIN.id,
                    firmId: SECOND_FIRM.id,
                }),
                account('a-funded', { copyGroupId: MAIN.id }),
                account('c-eval', {
                    copyGroupId: SPARE.id,
                    stage: AccountStage.Eval,
                }),
            ],
        );
        expect(overview.groups.map((row) => row.group)).toEqual([MAIN, SPARE]);
        const [main, spare] = overview.groups;
        expect(main?.members).toEqual([
            {
                firmName: FIRST_FIRM.displayName,
                id: 'a-funded',
                isArchived: false,
                label: 'a-funded',
                stage: AccountStage.Funded,
                stageLabel: 'Funded',
                status: AccountStatus.Active,
            },
            {
                firmName: SECOND_FIRM.displayName,
                id: 'b-funded',
                isArchived: false,
                label: 'b-funded',
                stage: AccountStage.Funded,
                stageLabel: 'Funded',
                status: AccountStatus.Active,
            },
        ]);
        expect(main?.firmNames).toEqual(
            [FIRST_FIRM.displayName, SECOND_FIRM.displayName].toSorted(
                compareText,
            ),
        );
        expect(main?.stage).toBe(AccountStage.Funded);
        expect(main?.isMixedStage).toBe(false);
        expect(main?.stageSummary).toBe('2 Funded');
        expect(spare?.members.map((member) => member.id)).toEqual(['c-eval']);
        expect(spare?.stage).toBe(AccountStage.Eval);
    });

    it('flags a group whose active members span more than one stage', () => {
        const [row] = copyGroupRows(
            [MAIN],
            [
                account('funded-1', { copyGroupId: MAIN.id }),
                account('eval-1', {
                    copyGroupId: MAIN.id,
                    stage: AccountStage.Eval,
                }),
                account('funded-2', { copyGroupId: MAIN.id }),
            ],
        ).groups;
        expect(row?.isMixedStage).toBe(true);
        expect(row?.stage).toBeNull();
        expect(row?.stageCounts).toEqual([
            { count: 1, stage: AccountStage.Eval },
            { count: 2, stage: AccountStage.Funded },
        ]);
        expect(row?.stageSummary).toBe('1 Evaluation, 2 Funded');
    });

    it('keeps inactive and archived members out of the stage check but lists them apart', () => {
        const [row] = copyGroupRows(
            [MAIN],
            [
                account('funded', { copyGroupId: MAIN.id }),
                account('busted-eval', {
                    copyGroupId: MAIN.id,
                    stage: AccountStage.Eval,
                    status: AccountStatus.Busted,
                }),
                account('archived-live', {
                    archivedAt: new Date('2026-09-01T00:00:00Z'),
                    copyGroupId: MAIN.id,
                    stage: AccountStage.Live,
                }),
            ],
        ).groups;
        expect(row?.members.map((member) => member.id)).toEqual(['funded']);
        expect(row?.isMixedStage).toBe(false);
        expect(row?.stage).toBe(AccountStage.Funded);
        expect(
            row?.otherMembers.map((member) => [member.id, member.isArchived]),
        ).toEqual([
            ['archived-live', true],
            ['busted-eval', false],
        ]);
    });

    it('lists unassigned active accounts and leaves out archived, inactive and grouped ones', () => {
        const overview = copyGroupRows(
            [MAIN],
            [
                account('zeta'),
                account('alpha', { stage: AccountStage.Eval }),
                account('grouped', { copyGroupId: MAIN.id }),
                account('archived', {
                    archivedAt: new Date('2026-09-01T00:00:00Z'),
                }),
                account('closed', { status: AccountStatus.Closed }),
            ],
        );
        expect(overview.unassigned.map((member) => member.id)).toEqual([
            'alpha',
            'zeta',
        ]);
        expect(overview.unassigned[0]?.stageLabel).toBe('Evaluation');
    });

    it('shows an empty group with no stage and no members', () => {
        const [row] = copyGroupRows([SPARE], []).groups;
        expect(row).toMatchObject({
            firmNames: [],
            isMixedStage: false,
            members: [],
            otherMembers: [],
            stage: null,
            stageCounts: [],
            stageSummary: 'No active members',
        });
    });

    it('returns no groups and no accounts for empty inputs', () => {
        expect(copyGroupRows([], [])).toEqual({ groups: [], unassigned: [] });
    });

    it('falls back to the stored firm id for a firm that is no longer modeled', () => {
        const [member] = copyGroupRows(
            [],
            [account('old', { firmId: 'gone-firm' })],
        ).unassigned;
        expect(member?.firmName).toBe('gone-firm');
    });
});

describe('stageRosterOf', () => {
    it('names the members of each stage, in stage order', () => {
        const [row] = copyGroupRows(
            [MAIN],
            [
                account('funded-b', { copyGroupId: MAIN.id }),
                account('eval-a', {
                    copyGroupId: MAIN.id,
                    stage: AccountStage.Eval,
                }),
                account('funded-a', { copyGroupId: MAIN.id }),
            ],
        ).groups;
        expect(
            stageRosterOf(row?.members ?? []).map((roster) => [
                roster.stage,
                roster.stageLabel,
                roster.members.map((member) => member.label),
            ]),
        ).toEqual([
            [AccountStage.Eval, 'Evaluation', ['eval-a']],
            [AccountStage.Funded, 'Funded', ['funded-a', 'funded-b']],
        ]);
        expect(stageRosterOf([])).toEqual([]);
    });
});

describe('stageConflictsOf', () => {
    it('names every member of another stage, inactive and archived ones included', () => {
        const [row] = copyGroupRows(
            [MAIN],
            [
                account('funded', { copyGroupId: MAIN.id }),
                account('busted-eval', {
                    copyGroupId: MAIN.id,
                    stage: AccountStage.Eval,
                    status: AccountStatus.Busted,
                }),
                account('archived-eval', {
                    archivedAt: new Date('2026-09-01T00:00:00Z'),
                    copyGroupId: MAIN.id,
                    stage: AccountStage.Eval,
                }),
                account('archived-funded', {
                    archivedAt: new Date('2026-09-01T00:00:00Z'),
                    copyGroupId: MAIN.id,
                }),
            ],
        ).groups;
        if (row === undefined) throw new Error('a group row is needed');
        expect(
            stageConflictsOf(row, AccountStage.Funded).map(
                (member) => member.id,
            ),
        ).toEqual(['archived-eval', 'busted-eval']);
        expect(
            stageConflictsOf(row, AccountStage.Eval).map((member) => member.id),
        ).toEqual(['archived-funded', 'funded']);
        expect(stageConflictsOf(row, AccountStage.Live)).toHaveLength(4);
    });

    it('finds no conflict in an empty group', () => {
        const [row] = copyGroupRows([SPARE], []).groups;
        if (row === undefined) throw new Error('a group row is needed');
        expect(stageConflictsOf(row, AccountStage.Eval)).toEqual([]);
    });
});

describe('memberStateLabel', () => {
    it('says archived or names the status of a member that is not active', () => {
        const [active, archived, busted] = copyGroupRows(
            [MAIN],
            [
                account('a-active', { copyGroupId: MAIN.id }),
                account('b-archived', {
                    archivedAt: new Date('2026-09-01T00:00:00Z'),
                    copyGroupId: MAIN.id,
                    status: AccountStatus.Busted,
                }),
                account('c-busted', {
                    copyGroupId: MAIN.id,
                    status: AccountStatus.Busted,
                }),
            ],
        ).groups.flatMap((row) => [...row.members, ...row.otherMembers]);
        expect(
            active === undefined ? 'missing' : memberStateLabel(active),
        ).toBe(null);
        expect(
            archived === undefined ? 'missing' : memberStateLabel(archived),
        ).toBe('archived');
        expect(
            busted === undefined ? 'missing' : memberStateLabel(busted),
        ).toBe('busted');
    });
});

describe('copyGroupNameError', () => {
    it('accepts a name up to the account label limit, trimmed', () => {
        expect(copyGroupNameError('  Main copy  ')).toBeNull();
        expect(copyGroupNameError('x'.repeat(MAX_ACCOUNT_LABEL_LENGTH))).toBe(
            null,
        );
    });

    it('asks for a name when it is empty or blank', () => {
        expect(copyGroupNameError('')).toBe('Enter a group name.');
        expect(copyGroupNameError(' '.repeat(3))).toBe('Enter a group name.');
    });

    it('names the limit when the name is too long', () => {
        expect(
            copyGroupNameError('x'.repeat(MAX_ACCOUNT_LABEL_LENGTH + 1)),
        ).toBe(
            `Keep the group name to ${MAX_ACCOUNT_LABEL_LENGTH} characters or fewer.`,
        );
    });

    it('refuses control, bidirectional and invisible characters', () => {
        expect(copyGroupNameError('Main\ncopy')).toMatch(
            /^The group name must be one line/,
        );
        expect(copyGroupNameError('Main‮copy')).toMatch(
            /^The group name must be one line/,
        );
    });
});
