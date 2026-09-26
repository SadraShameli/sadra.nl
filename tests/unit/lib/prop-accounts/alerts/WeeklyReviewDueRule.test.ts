import { describe, expect, it } from 'vitest';

import {
    AlertKind,
    AlertSeverity,
    AlertSubjectKind,
    WeeklyReviewDueRule,
} from '~/lib/prop-accounts/alerts';
import { AccountStatus } from '~/lib/prop-accounts/core';
import { DEFAULT_RULEBOOK, ReviewWeekday } from '~/lib/prop-calculator/advisor';

import {
    accountFor,
    alertsOf,
    ANY_EVAL_PLAN,
    FRIDAY,
    MONDAY,
    snapshotFor,
    WEDNESDAY,
} from './alertFixtures';

const rule = new WeeklyReviewDueRule();

describe('WeeklyReviewDueRule', () => {
    it('fires on the review weekday for accounts without a snapshot that day', () => {
        const reviewed = accountFor(ANY_EVAL_PLAN);
        const pending = accountFor(ANY_EVAL_PLAN);
        const alerts = alertsOf(rule, {
            accounts: [reviewed, pending],
            snapshots: [
                snapshotFor(reviewed, { asOf: MONDAY }),
                snapshotFor(pending, { asOf: FRIDAY }),
            ],
            today: MONDAY,
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.kind).toBe(AlertKind.WeeklyReviewDue);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Info);
        expect(alerts[0]?.subject).toEqual({
            accountIds: [pending.id],
            kind: AlertSubjectKind.Portfolio,
        });
        expect(alerts[0]?.message).toContain(MONDAY);
        expect(alerts[0]?.message).toContain('1 of 2');
    });

    it('is silent once every active account has a snapshot on the review day', () => {
        const account = accountFor(ANY_EVAL_PLAN);
        const busted = accountFor(ANY_EVAL_PLAN, {
            status: AccountStatus.Busted,
        });
        expect(
            alertsOf(rule, {
                accounts: [account, busted],
                snapshots: [snapshotFor(account, { asOf: MONDAY })],
                today: MONDAY,
            }),
        ).toEqual([]);
    });

    it('is silent later in the week when the review was done', () => {
        const account = accountFor(ANY_EVAL_PLAN);
        expect(
            alertsOf(rule, {
                accounts: [account],
                snapshots: [snapshotFor(account, { asOf: MONDAY })],
                today: WEDNESDAY,
            }),
        ).toEqual([]);
    });

    it('stays due after a missed review weekday', () => {
        const account = accountFor(ANY_EVAL_PLAN);
        expect(
            alertsOf(rule, {
                accounts: [account],
                snapshots: [snapshotFor(account, { asOf: FRIDAY })],
                today: WEDNESDAY,
            }),
        ).toHaveLength(1);
    });

    it('uses the rulebook review weekday', () => {
        const account = accountFor(ANY_EVAL_PLAN);
        const rulebook = {
            ...DEFAULT_RULEBOOK,
            review: {
                ...DEFAULT_RULEBOOK.review,
                weekday: ReviewWeekday.Wednesday,
            },
        };
        expect(
            alertsOf(rule, {
                accounts: [account],
                rulebook,
                snapshots: [snapshotFor(account, { asOf: MONDAY })],
                today: WEDNESDAY,
            }),
        ).toHaveLength(1);
    });

    it('is silent without active accounts', () => {
        expect(alertsOf(rule, { today: MONDAY })).toEqual([]);
    });
});
