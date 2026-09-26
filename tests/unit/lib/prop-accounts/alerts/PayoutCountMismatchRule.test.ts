import { describe, expect, it } from 'vitest';

import {
    AlertKind,
    AlertSeverity,
    PayoutCountMismatchRule,
} from '~/lib/prop-accounts/alerts';
import { AccountStage, PayoutStatus } from '~/lib/prop-accounts/core';

import {
    accountFor,
    alertsOf,
    ANY_EVAL_PLAN,
    MONDAY,
    paidPayout,
    snapshotFor,
} from './alertFixtures';

const rule = new PayoutCountMismatchRule();
const account = accountFor(ANY_EVAL_PLAN, { stage: AccountStage.Funded });

function alertsWith(
    payoutsTaken: null | number,
    payouts: ReturnType<typeof paidPayout>[],
    asOf = MONDAY,
) {
    return alertsOf(rule, {
        accounts: [account],
        payouts,
        snapshots: [snapshotFor(account, { asOf, payoutsTaken })],
    });
}

describe('PayoutCountMismatchRule', () => {
    it('is silent when the snapshot count equals the paid ledger count', () => {
        expect(
            alertsWith(2, [paidPayout(account), paidPayout(account)]),
        ).toEqual([]);
    });

    it('fires when the snapshot count differs from the paid count', () => {
        const alerts = alertsWith(2, [
            paidPayout(account),
            paidPayout(account, { status: PayoutStatus.Requested }),
            paidPayout(account, { status: PayoutStatus.Denied }),
        ]);
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.kind).toBe(AlertKind.PayoutCountMismatch);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
        expect(alerts[0]?.message).toContain('2 payouts');
        expect(alerts[0]?.message).toContain('1 paid');
    });

    it('counts only payouts paid on or before the snapshot date', () => {
        expect(
            alertsWith(1, [
                paidPayout(account, { paidOn: '2026-09-10' }),
                paidPayout(account, { paidOn: '2026-09-22' }),
            ]),
        ).toEqual([]);
    });

    it('never dates a paid payout by its request date: one without a paid date is not counted', () => {
        const alerts = alertsWith(1, [
            paidPayout(account, {
                paidOn: null,
                requestedOn: '2026-09-10',
            }),
        ]);
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.message).toContain('0 paid');
    });

    it('is silent without a snapshot count or a snapshot', () => {
        expect(alertsWith(null, [paidPayout(account)])).toEqual([]);
        expect(
            alertsOf(rule, {
                accounts: [account],
                payouts: [paidPayout(account)],
            }),
        ).toEqual([]);
    });
});
