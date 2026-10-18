import { describe, expect, it } from 'vitest';

import {
    AlertKind,
    AlertSeverity,
    AlertSubjectKind,
    CapacityExceededRule,
} from '~/lib/prop-accounts/alerts';
import { AccountStatus, AccountTracking } from '~/lib/prop-accounts/core';
import {
    DEFAULT_RULEBOOK,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';

import { accountFor, alertsOf, ANY_EVAL_PLAN } from './alertFixtures';

const rule = new CapacityExceededRule();

const GROUP_ID = '30000000-0000-4000-8000-000000000001';

function rulebookWithCapacity(capacity: null | number): RulebookParameters {
    return {
        ...DEFAULT_RULEBOOK,
        bankroll: {
            ...DEFAULT_RULEBOOK.bankroll,
            dailyAccountCapacity: capacity,
        },
    };
}

describe('CapacityExceededRule', () => {
    it('is off when the daily account capacity is not set, however many accounts are active', () => {
        const accounts = Array.from({ length: 12 }, () =>
            accountFor(ANY_EVAL_PLAN),
        );
        expect(
            alertsOf(rule, { accounts, rulebook: rulebookWithCapacity(null) }),
        ).toEqual([]);
    });

    it('is silent at exactly the capacity', () => {
        const accounts = [accountFor(ANY_EVAL_PLAN), accountFor(ANY_EVAL_PLAN)];
        expect(
            alertsOf(rule, { accounts, rulebook: rulebookWithCapacity(2) }),
        ).toEqual([]);
    });

    it('warns once above the capacity and names every active account', () => {
        const accounts = [
            accountFor(ANY_EVAL_PLAN),
            accountFor(ANY_EVAL_PLAN),
            accountFor(ANY_EVAL_PLAN),
        ];
        const alerts = alertsOf(rule, {
            accounts,
            rulebook: rulebookWithCapacity(2),
        });
        expect(alerts).toHaveLength(1);
        const [alert] = alerts;
        expect(alert?.kind).toBe(AlertKind.CapacityExceeded);
        expect(alert?.severity).toBe(AlertSeverity.Warning);
        expect(alert?.subject).toEqual({
            accountIds: accounts.map((account) => account.id),
            kind: AlertSubjectKind.Portfolio,
        });
        expect(alert?.message).toContain('3');
        expect(alert?.message).toContain('2');
    });

    it('counts a copy group once, however many accounts it holds', () => {
        const accounts = [
            accountFor(ANY_EVAL_PLAN, { copyGroupId: GROUP_ID }),
            accountFor(ANY_EVAL_PLAN, { copyGroupId: GROUP_ID }),
            accountFor(ANY_EVAL_PLAN, { copyGroupId: GROUP_ID }),
            accountFor(ANY_EVAL_PLAN),
        ];
        expect(
            alertsOf(rule, { accounts, rulebook: rulebookWithCapacity(2) }),
        ).toEqual([]);
        expect(
            alertsOf(rule, { accounts, rulebook: rulebookWithCapacity(1) }),
        ).toHaveLength(1);
    });

    it('does not count ended accounts', () => {
        const accounts = [
            accountFor(ANY_EVAL_PLAN),
            accountFor(ANY_EVAL_PLAN, { status: AccountStatus.Busted }),
            accountFor(ANY_EVAL_PLAN, { status: AccountStatus.Closed }),
        ];
        expect(
            alertsOf(rule, { accounts, rulebook: rulebookWithCapacity(1) }),
        ).toEqual([]);
    });

    it('does not count archived accounts', () => {
        const accounts = [
            accountFor(ANY_EVAL_PLAN),
            accountFor(ANY_EVAL_PLAN, { archivedAt: new Date('2026-09-01') }),
        ];
        expect(
            alertsOf(rule, { accounts, rulebook: rulebookWithCapacity(1) }),
        ).toEqual([]);
    });

    it('counts an active ledger-only account, because it still has to be managed', () => {
        const accounts = [
            accountFor(ANY_EVAL_PLAN),
            accountFor(ANY_EVAL_PLAN, {
                planLabel: 'Hola 100K',
                planSerial: null,
                tracking: AccountTracking.LedgerOnly,
            }),
        ];
        expect(
            alertsOf(rule, { accounts, rulebook: rulebookWithCapacity(1) }),
        ).toHaveLength(1);
    });

    it('counts two modeled accounts and an active ledger-only account as three units, the same as the next-slot ranking', () => {
        const accounts = [
            accountFor(ANY_EVAL_PLAN),
            accountFor(ANY_EVAL_PLAN),
            accountFor(ANY_EVAL_PLAN, {
                planLabel: 'Hola 100K',
                planSerial: null,
                tracking: AccountTracking.LedgerOnly,
            }),
        ];
        expect(
            alertsOf(rule, { accounts, rulebook: rulebookWithCapacity(3) }),
        ).toEqual([]);
        const [alert] = alertsOf(rule, {
            accounts,
            rulebook: rulebookWithCapacity(2),
        });
        expect(alert?.message).toContain('You hold 3 accounts to manage a day');
        expect(alert?.message).toContain('3 active accounts');
    });
});
