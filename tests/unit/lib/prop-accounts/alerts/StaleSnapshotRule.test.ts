import { describe, expect, it } from 'vitest';

import {
    AlertDisclosure,
    AlertKind,
    AlertSeverity,
    AlertSubjectKind,
    StaleSnapshotRule,
} from '~/lib/prop-accounts/alerts';
import {
    AccountStage,
    accountStageLabel,
    AccountStatus,
} from '~/lib/prop-accounts/core';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';

import {
    accountFor,
    alertsOf,
    ANY_EVAL_PLAN,
    FRIDAY,
    MONDAY,
    snapshotFor,
    TUESDAY,
    WEDNESDAY,
} from './alertFixtures';

const rule = new StaleSnapshotRule();

function alertsFor(
    stage: AccountStage,
    asOf: null | string,
    today = WEDNESDAY,
    rulebook = DEFAULT_RULEBOOK,
) {
    const account = accountFor(ANY_EVAL_PLAN, { stage });
    const snapshots = asOf === null ? [] : [snapshotFor(account, { asOf })];
    return {
        account,
        alerts: alertsOf(rule, {
            accounts: [account],
            rulebook,
            snapshots,
            today,
        }),
    };
}

describe('StaleSnapshotRule', () => {
    it.each([AccountStage.Eval, AccountStage.Live])(
        'a %s snapshot from the last session is fresh',
        (stage) => {
            expect(alertsFor(stage, TUESDAY).alerts).toEqual([]);
            expect(alertsFor(stage, WEDNESDAY).alerts).toEqual([]);
        },
    );

    it.each([AccountStage.Eval, AccountStage.Live])(
        'a %s snapshot that predates the last session fires',
        (stage) => {
            const { account, alerts } = alertsFor(stage, MONDAY);
            expect(alerts).toHaveLength(1);
            const [alert] = alerts;
            expect(alert?.kind).toBe(AlertKind.StaleSnapshot);
            expect(alert?.severity).toBe(AlertSeverity.Warning);
            expect(alert?.subject).toEqual({
                accountId: account.id,
                kind: AlertSubjectKind.Account,
                label: account.label,
            });
            expect(alert?.message).toContain(MONDAY);
            expect(alert?.message).toContain(TUESDAY);
            expect(alert?.message).toContain(
                `before sizing this ${accountStageLabel(stage)} account`,
            );
            expect(alert?.message).not.toContain(`this ${stage} account`);
            expect(alert?.disclosures).toEqual([
                AlertDisclosure.NoHolidayCalendar,
            ]);
        },
    );

    it('skips the weekend: a Friday eval snapshot is fresh on Monday', () => {
        expect(alertsFor(AccountStage.Eval, FRIDAY, MONDAY).alerts).toEqual([]);
    });

    it('a funded snapshot is stale only after the rulebook stale days', () => {
        expect(alertsFor(AccountStage.Funded, MONDAY).alerts).toEqual([]);
        expect(alertsFor(AccountStage.Funded, '2026-09-16').alerts).toEqual([]);
        const { alerts } = alertsFor(AccountStage.Funded, '2026-09-15');
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.message).toContain('8 days');
        expect(alerts[0]?.message).toContain('7 days');
        expect(alerts[0]?.disclosures).toEqual([]);
    });

    it('reads the funded stale days from the rulebook', () => {
        const rulebook = {
            ...DEFAULT_RULEBOOK,
            review: { ...DEFAULT_RULEBOOK.review, fundedStaleDays: 3 },
        };
        expect(
            alertsFor(AccountStage.Funded, '2026-09-20', WEDNESDAY, rulebook)
                .alerts,
        ).toEqual([]);
        expect(
            alertsFor(AccountStage.Funded, '2026-09-19', WEDNESDAY, rulebook)
                .alerts,
        ).toHaveLength(1);
    });

    it.each(Object.values(AccountStage))(
        'a %s account without any snapshot fires',
        (stage) => {
            const { alerts } = alertsFor(stage, null);
            expect(alerts).toHaveLength(1);
            expect(alerts[0]?.message).toContain('No balance snapshot');
            expect(alerts[0]?.message).toContain(
                `for this ${accountStageLabel(stage)} account`,
            );
        },
    );

    it('names the stage by its label, never by the raw stage value', () => {
        expect(alertsFor(AccountStage.Eval, null).alerts[0]?.message).toBe(
            'No balance snapshot recorded yet for this Evaluation account; enter its current balance',
        );
        const stale = alertsFor(AccountStage.Eval, MONDAY).alerts[0]?.message;
        expect(stale).toContain('this Evaluation account');
        expect(stale).not.toContain('this eval account');
        expect(
            alertsFor(AccountStage.Live, MONDAY).alerts[0]?.message,
        ).toContain('before sizing this Live account');
    });

    it('ignores accounts that are not active', () => {
        const account = accountFor(ANY_EVAL_PLAN, {
            status: AccountStatus.Busted,
        });
        expect(
            alertsOf(rule, {
                accounts: [account],
                snapshots: [snapshotFor(account, { asOf: FRIDAY })],
            }),
        ).toEqual([]);
    });
});
