import { describe, expect, it } from 'vitest';

import {
    type AccountAlert,
    AccountAlertRule,
    AlertKind,
    alertKindLabel,
    AlertSeverity,
    AlertSubjectKind,
    InvalidStoredDateRule,
    type MonitoredAccount,
    StoredDateField,
} from '~/lib/prop-accounts/alerts';
import { AccountStage, IsoDateError } from '~/lib/prop-accounts/core';

import {
    accountFor,
    ANY_EVAL_PLAN,
    contextOf,
    paidPayout,
    snapshotFor,
    TUESDAY,
} from './alertFixtures';

class SeenAccountsRule extends AccountAlertRule {
    readonly kind = AlertKind.StaleSnapshot;
    readonly seen: string[] = [];

    protected evaluateAccount(monitored: MonitoredAccount): null {
        this.seen.push(monitored.account.id);
        return null;
    }
}

class ThrowingRule extends AccountAlertRule {
    readonly kind = AlertKind.EvalDayCapNear;

    constructor(private readonly error: Error) {
        super();
    }

    protected evaluateAccount(): AccountAlert | null {
        throw this.error;
    }
}

describe('createAlertContext date safety', () => {
    it('lists every malformed stored date of an account and keeps it out of the snapshot and payout lists', () => {
        const account = accountFor(ANY_EVAL_PLAN, {
            purchasedOn: '2026-13-01',
        });
        const badSnapshot = snapshotFor(account, { asOf: 'yesterday' });
        const goodSnapshot = snapshotFor(account, { asOf: '2026-09-01' });
        const badRequest = paidPayout(account, { requestedOn: '2026-02-30' });
        const badPaid = paidPayout(account, { paidOn: '1999-12-31' });
        const goodPayout = paidPayout(account);
        const monitored = contextOf({
            accounts: [account],
            payouts: [badRequest, badPaid, goodPayout],
            snapshots: [badSnapshot, goodSnapshot],
        }).accounts[0];
        expect(monitored?.invalidDates).toEqual([
            { field: StoredDateField.PurchasedOn, value: '2026-13-01' },
            { field: StoredDateField.SnapshotAsOf, value: 'yesterday' },
            { field: StoredDateField.PayoutRequestedOn, value: '2026-02-30' },
            { field: StoredDateField.PayoutPaidOn, value: '1999-12-31' },
        ]);
        expect(monitored?.latestSnapshot).toBe(goodSnapshot);
        expect(monitored?.payouts).toEqual([goodPayout]);
    });

    it('lists nothing for an account whose dates are all real', () => {
        const account = accountFor(ANY_EVAL_PLAN);
        const monitored = contextOf({
            accounts: [account],
            payouts: [paidPayout(account, { paidOn: null })],
            snapshots: [snapshotFor(account)],
        }).accounts[0];
        expect(monitored?.invalidDates).toEqual([]);
    });

    it('never hands an account with a malformed date to an account rule', () => {
        const clean = accountFor(ANY_EVAL_PLAN);
        const broken = accountFor(ANY_EVAL_PLAN, { purchasedOn: '2026-13-01' });
        const rule = new SeenAccountsRule();
        rule.evaluate(contextOf({ accounts: [clean, broken] }));
        expect(rule.seen).toEqual([clean.id]);
    });
});

describe('InvalidStoredDateRule', () => {
    it('raises one warning per account with malformed dates, naming each field and value', () => {
        const clean = accountFor(ANY_EVAL_PLAN);
        const broken = accountFor(ANY_EVAL_PLAN, {
            purchasedOn: '2026-13-01',
            stage: AccountStage.Funded,
        });
        const alerts = new InvalidStoredDateRule().evaluate(
            contextOf({
                accounts: [clean, broken],
                snapshots: [snapshotFor(broken, { asOf: 'yesterday' })],
            }),
        );
        expect(alerts).toHaveLength(1);
        expect(alerts[0]).toMatchObject({
            kind: AlertKind.InvalidStoredDate,
            severity: AlertSeverity.Warning,
            subject: {
                accountId: broken.id,
                kind: AlertSubjectKind.Account,
            },
        });
        expect(alerts[0]?.message).toContain('purchase date "2026-13-01"');
        expect(alerts[0]?.message).toContain('snapshot date "yesterday"');
        expect(alerts[0]?.message).toContain('2000 through 2100');
        expect(alerts[0]?.message).toContain('not checked');
    });

    it('is silent when every stored date is real', () => {
        const account = accountFor(ANY_EVAL_PLAN);
        const snapshot = snapshotFor(account, { asOf: TUESDAY });
        expect(
            new InvalidStoredDateRule().evaluate(
                contextOf({ accounts: [account], snapshots: [snapshot] }),
            ),
        ).toEqual([]);
    });
});

describe('the guarded account rule fallback', () => {
    it('names the alert by its display label and blames the code for an ordinary error', () => {
        const alerts = new ThrowingRule(new Error('boom')).evaluate(
            contextOf({ accounts: [accountFor(ANY_EVAL_PLAN)] }),
        );
        expect(alerts).toHaveLength(1);
        const message = alerts[0]?.message ?? '';
        expect(message).toContain(alertKindLabel(AlertKind.EvalDayCapNear));
        expect(message).not.toContain(AlertKind.EvalDayCapNear);
        expect(message).toContain('failed in the code');
        expect(message).toContain('boom');
        expect(message).not.toContain("fix the account's stored data");
    });

    it('blames the stored data for a date error', () => {
        const alerts = new ThrowingRule(
            new IsoDateError('Not a calendar date: "2026-02-30"'),
        ).evaluate(contextOf({ accounts: [accountFor(ANY_EVAL_PLAN)] }));
        const message = alerts[0]?.message ?? '';
        expect(message).toContain(alertKindLabel(AlertKind.EvalDayCapNear));
        expect(message).toContain('stored data');
        expect(message).toContain('2026-02-30');
        expect(message).not.toContain('failed in the code');
    });
});

describe('alertKindLabel', () => {
    it('gives every alert kind a readable label that is not its raw value', () => {
        const labels = Object.values(AlertKind).map((kind) => [
            kind,
            alertKindLabel(kind),
        ]);
        for (const [kind, label] of labels) {
            expect(label, kind).not.toBe(kind);
            expect(label, kind).toMatch(/^[A-Z][a-z]/);
            expect(label, kind).not.toContain('—');
        }
        expect(new Set(labels.map(([, label]) => label)).size).toBe(
            labels.length,
        );
    });
});
