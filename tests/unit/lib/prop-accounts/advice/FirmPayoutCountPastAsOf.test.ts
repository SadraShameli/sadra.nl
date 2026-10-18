import { describe, expect, it } from 'vitest';

import {
    firmPayoutCountOf,
    firmPayoutCounts,
    otherAccountsRequestedPayoutCountOf,
    ownRequestedPayoutCountOf,
} from '~/lib/prop-accounts/advice';
import { AccountEventKind, PayoutStatus } from '~/lib/prop-accounts/core';

import {
    account,
    EVAL_PLAN,
    event,
    ledger,
    payout,
    SAME_FIRM_SECOND_EVAL_PLAN,
} from '../metrics/ledgerFixtures';

function requestedThenPaid(
    owner: ReturnType<typeof account>,
    requestedOn: string,
    paidOn: string,
) {
    return payout(owner, 1000, { paidOn, requestedOn });
}

describe('a firm payout count at a past as-of date counts a payout requested by then and paid after it as requested (PT-36n, F-145)', () => {
    it('counts a payout requested on or before the date and paid after it as pending, not as paid', () => {
        const acct = account(EVAL_PLAN);
        const [count] = firmPayoutCounts(
            ledger({
                accounts: [acct],
                payouts: [requestedThenPaid(acct, '2026-09-10', '2026-09-20')],
            }),
            '2026-09-15',
        );
        expect(count?.paidPayoutsSinceLastLiveAccount).toBe(0);
        expect(count?.requestedPayoutsSinceLastLiveAccount).toBe(1);
    });

    it('counts it as paid, not requested, from the day it was paid', () => {
        const acct = account(EVAL_PLAN);
        const [count] = firmPayoutCounts(
            ledger({
                accounts: [acct],
                payouts: [requestedThenPaid(acct, '2026-09-10', '2026-09-20')],
            }),
            '2026-09-20',
        );
        expect(count?.paidPayoutsSinceLastLiveAccount).toBe(1);
        expect(count?.requestedPayoutsSinceLastLiveAccount).toBe(0);
    });

    it('counts it as neither before it was requested', () => {
        const acct = account(EVAL_PLAN);
        const [count] = firmPayoutCounts(
            ledger({
                accounts: [acct],
                payouts: [requestedThenPaid(acct, '2026-09-10', '2026-09-20')],
            }),
            '2026-09-05',
        );
        expect(count?.paidPayoutsSinceLastLiveAccount).toBe(0);
        expect(count?.requestedPayoutsSinceLastLiveAccount).toBe(0);
    });

    it('never counts a denied payout as pending at any date', () => {
        const acct = account(EVAL_PLAN);
        const [count] = firmPayoutCounts(
            ledger({
                accounts: [acct],
                payouts: [
                    payout(acct, 1000, {
                        paidOn: '2026-09-20',
                        requestedOn: '2026-09-10',
                        status: PayoutStatus.Denied,
                    }),
                ],
            }),
            '2026-09-15',
        );
        expect(count?.requestedPayoutsSinceLastLiveAccount).toBe(0);
    });

    it('still leaves out a request made before the last live move at that date', () => {
        const acct = account(EVAL_PLAN);
        const [count] = firmPayoutCounts(
            ledger({
                accounts: [acct],
                events: [event(acct, AccountEventKind.MovedLive, '2026-09-12')],
                payouts: [requestedThenPaid(acct, '2026-09-10', '2026-09-20')],
            }),
            '2026-09-15',
        );
        expect(count?.requestedPayoutsSinceLastLiveAccount).toBe(0);
    });

    it('gives the same past-date count from the member list as from the ledger', () => {
        const acct = account(EVAL_PLAN);
        const sibling = account(SAME_FIRM_SECOND_EVAL_PLAN);
        const own = [requestedThenPaid(acct, '2026-09-10', '2026-09-20')];
        const other = [requestedThenPaid(sibling, '2026-09-12', '2026-09-22')];
        const count = firmPayoutCountOf(
            EVAL_PLAN.firm.id,
            [
                { events: [], payouts: own },
                { events: [], payouts: other },
            ],
            '2026-09-15',
        );
        expect(count.requestedPayoutsSinceLastLiveAccount).toBe(2);
        expect(ownRequestedPayoutCountOf(count, own, '2026-09-15')).toBe(1);
        expect(
            otherAccountsRequestedPayoutCountOf(count, own, '2026-09-15'),
        ).toBe(1);
    });
});
