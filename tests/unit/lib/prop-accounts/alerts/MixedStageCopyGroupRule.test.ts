import { describe, expect, it } from 'vitest';

import {
    AlertKind,
    AlertSeverity,
    AlertSubjectKind,
    MixedStageCopyGroupRule,
} from '~/lib/prop-accounts/alerts';
import { AccountStage, AccountStatus } from '~/lib/prop-accounts/core';

import {
    accountFor,
    alertsOf,
    ANY_EVAL_PLAN,
    copyGroup,
} from './alertFixtures';

const rule = new MixedStageCopyGroupRule();
const GROUP = copyGroup('30000000-0000-4000-8000-000000000001', 'Main copy');

function member(stage: AccountStage, status = AccountStatus.Active) {
    return accountFor(ANY_EVAL_PLAN, { copyGroupId: GROUP.id, stage, status });
}

describe('MixedStageCopyGroupRule', () => {
    it('is silent when every active member shares one stage', () => {
        expect(
            alertsOf(rule, {
                accounts: [
                    member(AccountStage.Funded),
                    member(AccountStage.Funded),
                    accountFor(ANY_EVAL_PLAN, { stage: AccountStage.Eval }),
                ],
                copyGroups: [GROUP],
            }),
        ).toEqual([]);
    });

    it('fires when active members span more than one stage', () => {
        const evalMember = member(AccountStage.Eval);
        const fundedMembers = [
            member(AccountStage.Funded),
            member(AccountStage.Funded),
        ];
        const alerts = alertsOf(rule, {
            accounts: [evalMember, ...fundedMembers],
            copyGroups: [GROUP],
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.kind).toBe(AlertKind.MixedStageCopyGroup);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
        expect(alerts[0]?.subject).toEqual({
            accountIds: [evalMember.id, ...fundedMembers.map((a) => a.id)],
            copyGroupId: GROUP.id,
            kind: AlertSubjectKind.CopyGroup,
            name: GROUP.name,
        });
        expect(alerts[0]?.message).toContain('Main copy');
        expect(alerts[0]?.message).toContain('1 eval');
        expect(alerts[0]?.message).toContain('2 funded');
    });

    it('ignores inactive and archived members', () => {
        expect(
            alertsOf(rule, {
                accounts: [
                    member(AccountStage.Funded),
                    member(AccountStage.Eval, AccountStatus.Busted),
                    {
                        ...member(AccountStage.Live),
                        archivedAt: new Date('2026-09-01T00:00:00Z'),
                    },
                ],
                copyGroups: [GROUP],
            }),
        ).toEqual([]);
    });
});
