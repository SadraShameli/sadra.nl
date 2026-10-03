import { describe, expect, it } from 'vitest';

import {
    firmPayoutCountOf,
    firmPayoutCountOrNull,
    firmPayoutCounts,
    paidPayoutsSinceLastLiveAccountFor,
} from '~/lib/prop-accounts/advice';
import {
    otherAccountsRequestedPayoutCountOf,
    ownRequestedPayoutCountOf,
} from '~/lib/prop-accounts/advice/FirmPayoutCount';
import { AccountEventKind, PayoutStatus } from '~/lib/prop-accounts/core';

import {
    account,
    EVAL_PLAN,
    event,
    ledger,
    OTHER_FIRM_EVAL_PLAN,
    payout,
    SAME_FIRM_SECOND_EVAL_PLAN,
} from '../metrics/ledgerFixtures';

const ASOF = '2026-09-27';

function requested(owner: ReturnType<typeof account>, requestedOn: string) {
    return payout(owner, 1000, {
        paidOn: null,
        requestedOn,
        status: PayoutStatus.Requested,
    });
}

describe('firmPayoutCounts', () => {
    it('counts every paid payout across the firm when no live move is on record', () => {
        const accountA = account(EVAL_PLAN);
        const accountB = account(SAME_FIRM_SECOND_EVAL_PLAN);
        const counts = firmPayoutCounts(
            ledger({
                accounts: [accountA, accountB],
                payouts: [
                    payout(accountA, 1000, { paidOn: '2026-09-01' }),
                    payout(accountB, 1000, { paidOn: '2026-09-02' }),
                ],
            }),
            ASOF,
        );
        expect(
            paidPayoutsSinceLastLiveAccountFor(counts, EVAL_PLAN.firm.id),
        ).toBe(2);
    });

    it("only counts payouts paid after the firm's latest MovedLive event", () => {
        const liveAccount = account(EVAL_PLAN);
        const counts = firmPayoutCounts(
            ledger({
                accounts: [liveAccount],
                events: [
                    event(
                        liveAccount,
                        AccountEventKind.MovedLive,
                        '2026-09-10',
                    ),
                ],
                payouts: [
                    payout(liveAccount, 1000, { paidOn: '2026-09-05' }),
                    payout(liveAccount, 1000, { paidOn: '2026-09-15' }),
                ],
            }),
            ASOF,
        );
        expect(
            paidPayoutsSinceLastLiveAccountFor(counts, EVAL_PLAN.firm.id),
        ).toBe(1);
    });

    it('uses the latest MovedLive event across every account at the firm', () => {
        const first = account(EVAL_PLAN);
        const second = account(SAME_FIRM_SECOND_EVAL_PLAN);
        const counts = firmPayoutCounts(
            ledger({
                accounts: [first, second],
                events: [
                    event(first, AccountEventKind.MovedLive, '2026-09-05'),
                    event(second, AccountEventKind.MovedLive, '2026-09-12'),
                ],
                payouts: [
                    payout(first, 1000, { paidOn: '2026-09-08' }),
                    payout(second, 1000, { paidOn: '2026-09-20' }),
                ],
            }),
            ASOF,
        );
        expect(
            paidPayoutsSinceLastLiveAccountFor(counts, EVAL_PLAN.firm.id),
        ).toBe(1);
    });

    it('ignores a MovedLive recorded after the as-of date', () => {
        const liveAccount = account(EVAL_PLAN);
        const counts = firmPayoutCounts(
            ledger({
                accounts: [liveAccount],
                events: [
                    event(
                        liveAccount,
                        AccountEventKind.MovedLive,
                        '2026-09-20',
                    ),
                ],
                payouts: [
                    payout(liveAccount, 1000, { paidOn: '2026-09-05' }),
                    payout(liveAccount, 1000, { paidOn: '2026-09-06' }),
                ],
            }),
            '2026-09-15',
        );
        expect(
            paidPayoutsSinceLastLiveAccountFor(counts, EVAL_PLAN.firm.id),
        ).toBe(2);
        expect(counts[0]?.sinceOn).toBeNull();
    });

    it('excludes payouts that are not yet paid and payouts after the as-of date', () => {
        const acct = account(EVAL_PLAN);
        const counts = firmPayoutCounts(
            ledger({
                accounts: [acct],
                payouts: [
                    payout(acct, 1000, {
                        paidOn: null,
                        status: PayoutStatus.Requested,
                    }),
                    payout(acct, 1000, { paidOn: '2026-10-01' }),
                ],
            }),
            ASOF,
        );
        expect(
            paidPayoutsSinceLastLiveAccountFor(counts, EVAL_PLAN.firm.id),
        ).toBe(0);
    });

    it('keeps counts separate per firm', () => {
        const home = account(EVAL_PLAN);
        const other = account(OTHER_FIRM_EVAL_PLAN);
        const counts = firmPayoutCounts(
            ledger({
                accounts: [home, other],
                payouts: [
                    payout(home, 1000, { paidOn: '2026-09-01' }),
                    payout(other, 1000, { paidOn: '2026-09-01' }),
                    payout(other, 1000, { paidOn: '2026-09-02' }),
                ],
            }),
            ASOF,
        );
        expect(
            paidPayoutsSinceLastLiveAccountFor(counts, EVAL_PLAN.firm.id),
        ).toBe(1);
        expect(
            paidPayoutsSinceLastLiveAccountFor(
                counts,
                OTHER_FIRM_EVAL_PLAN.firm.id,
            ),
        ).toBe(2);
    });

    it('returns null for a firm with no held accounts', () => {
        const counts = firmPayoutCounts(ledger({ accounts: [] }), ASOF);
        expect(
            paidPayoutsSinceLastLiveAccountFor(counts, EVAL_PLAN.firm.id),
        ).toBeNull();
    });
});

describe('requested payouts at the firm (PT-36i, F-145)', () => {
    it('counts every requested payout across the firm accounts, separately from the paid count', () => {
        const accountA = account(EVAL_PLAN);
        const accountB = account(SAME_FIRM_SECOND_EVAL_PLAN);
        const [count] = firmPayoutCounts(
            ledger({
                accounts: [accountA, accountB],
                payouts: [
                    payout(accountA, 1000, { paidOn: '2026-09-01' }),
                    requested(accountA, '2026-09-20'),
                    requested(accountB, '2026-09-21'),
                    requested(accountB, '2026-09-22'),
                ],
            }),
            ASOF,
        );
        expect(count?.paidPayoutsSinceLastLiveAccount).toBe(1);
        expect(count?.requestedPayoutsSinceLastLiveAccount).toBe(3);
    });

    it('leaves out a request dated after the as-of date and a request made before the last live move', () => {
        const liveAccount = account(EVAL_PLAN);
        const [count] = firmPayoutCounts(
            ledger({
                accounts: [liveAccount],
                events: [
                    event(
                        liveAccount,
                        AccountEventKind.MovedLive,
                        '2026-09-10',
                    ),
                ],
                payouts: [
                    requested(liveAccount, '2026-09-05'),
                    requested(liveAccount, '2026-09-15'),
                    requested(liveAccount, '2026-10-05'),
                ],
            }),
            ASOF,
        );
        expect(count?.requestedPayoutsSinceLastLiveAccount).toBe(1);
    });

    it('never counts a paid or a denied payout as requested', () => {
        const acct = account(EVAL_PLAN);
        const [count] = firmPayoutCounts(
            ledger({
                accounts: [acct],
                payouts: [
                    payout(acct, 1000, { paidOn: '2026-09-02' }),
                    payout(acct, 1000, {
                        paidOn: null,
                        requestedOn: '2026-09-03',
                        status: PayoutStatus.Denied,
                    }),
                ],
            }),
            ASOF,
        );
        expect(count?.requestedPayoutsSinceLastLiveAccount).toBe(0);
    });

    it('gives the requests at the other accounts: the firm total less the account own requests', () => {
        const accountA = account(EVAL_PLAN);
        const accountB = account(SAME_FIRM_SECOND_EVAL_PLAN);
        const ownRequests = [requested(accountA, '2026-09-20')];
        const firmCount = firmPayoutCountOf(
            EVAL_PLAN.firm.id,
            [
                { events: [], payouts: ownRequests },
                {
                    events: [],
                    payouts: [
                        requested(accountB, '2026-09-21'),
                        requested(accountB, '2026-09-22'),
                    ],
                },
            ],
            ASOF,
        );
        expect(
            otherAccountsRequestedPayoutCountOf(firmCount, ownRequests, ASOF),
        ).toBe(2);
        expect(otherAccountsRequestedPayoutCountOf(firmCount, [], ASOF)).toBe(
            3,
        );
        expect(ownRequestedPayoutCountOf(firmCount, ownRequests, ASOF)).toBe(1);
    });
});

describe('a firm payout count records the date it was computed at (PT-36l, F-145)', () => {
    it('carries the as-of date from the member list count', () => {
        expect(firmPayoutCountOf(EVAL_PLAN.firm.id, [], ASOF)).toMatchObject({
            asOf: ASOF,
        });
    });

    it('carries the as-of date from the ledger count', () => {
        const accountA = account(EVAL_PLAN);
        const [count] = firmPayoutCounts(
            ledger({ accounts: [accountA] }),
            ASOF,
        );
        expect(count).toMatchObject({ asOf: ASOF });
    });
});

describe('firmPayoutCountOrNull (PT-36p, F-145)', () => {
    it('returns the count of the firm', () => {
        const count = firmPayoutCountOf(EVAL_PLAN.firm.id, [], ASOF);
        expect(firmPayoutCountOrNull([count], EVAL_PLAN.firm.id)).toBe(count);
    });

    it('returns null for a firm with no count instead of counting nothing', () => {
        const count = firmPayoutCountOf(EVAL_PLAN.firm.id, [], ASOF);
        expect(
            firmPayoutCountOrNull([count], OTHER_FIRM_EVAL_PLAN.firm.id),
        ).toBeNull();
    });

    it('agrees with the paid count of the same firm', () => {
        const count = firmPayoutCountOf(EVAL_PLAN.firm.id, [], ASOF);
        expect(
            paidPayoutsSinceLastLiveAccountFor([count], EVAL_PLAN.firm.id),
        ).toBe(count.paidPayoutsSinceLastLiveAccount);
        expect(
            paidPayoutsSinceLastLiveAccountFor([], EVAL_PLAN.firm.id),
        ).toBeNull();
    });
});
