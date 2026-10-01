import { describe, expect, it } from 'vitest';

import {
    firmPayoutCounts,
    paidPayoutsSinceLastLiveAccountFor,
} from '~/lib/prop-accounts/advice';
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

    it('only counts payouts paid after the firm\'s latest MovedLive event', () => {
        const liveAccount = account(EVAL_PLAN);
        const counts = firmPayoutCounts(
            ledger({
                accounts: [liveAccount],
                events: [
                    event(liveAccount, AccountEventKind.MovedLive, '2026-09-10'),
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
