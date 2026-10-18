import { describe, expect, it } from 'vitest';

import { FeeKind, PayoutStatus } from '~/lib/prop-accounts/core';
import { spendAndPayouts } from '~/lib/prop-accounts/metrics';

import {
    account,
    EVAL_PLAN,
    fee,
    INSTANT_PLAN,
    ledger,
    OTHER_USER_ID,
    payout,
} from './ledgerFixtures';

describe('spendAndPayouts', () => {
    const a = account(EVAL_PLAN);
    const b = account(INSTANT_PLAN);

    it('nets refunds out of spend and counts only Paid payouts, net where given, gross flagged', () => {
        const result = spendAndPayouts(
            ledger({
                accounts: [a, b],
                fees: [
                    fee(a, FeeKind.EvalPurchase, 16_700, '2026-08-03'),
                    fee(a, FeeKind.Activation, 13_000, '2026-09-02'),
                    fee(a, FeeKind.Refund, 5000, '2026-09-05'),
                    fee(b, FeeKind.EvalPurchase, 1, '2026-09-06'),
                    fee(b, FeeKind.Other, 1, '2026-09-06'),
                    fee(b, FeeKind.Other, 1, '2026-09-06'),
                ],
                payouts: [
                    payout(a, 100_000, {
                        netCents: 90_000,
                        paidOn: '2026-09-20',
                    }),
                    payout(b, 50_000, {
                        paidOn: '2026-10-02',
                        requestedOn: '2026-09-29',
                    }),
                    payout(a, 70_000, {
                        netCents: 63_000,
                        paidOn: null,
                        status: PayoutStatus.Requested,
                    }),
                    payout(a, 70_000, {
                        netCents: 63_000,
                        status: PayoutStatus.Denied,
                    }),
                    payout(a, 70_000, {
                        netCents: 63_000,
                        status: PayoutStatus.Cancelled,
                    }),
                ],
            }),
        );
        expect(result.allTime).toEqual({
            feesBeforeRefunds: 29_703,
            grossOnlyPayouts: 1,
            net: 140_000 - 24_703,
            paidPayouts: 2,
            payouts: 140_000,
            refunds: 5000,
            spend: 24_703,
        });
        expect(result.undatedPaidPayouts).toBe(0);
        expect(result.byMonth.map((m) => m.month)).toEqual([
            '2026-08',
            '2026-09',
            '2026-10',
        ]);
        expect(result.byMonth[0]).toMatchObject({
            net: -16_700,
            payouts: 0,
            spend: 16_700,
        });
        expect(result.byMonth[1]).toMatchObject({
            feesBeforeRefunds: 13_003,
            grossOnlyPayouts: 0,
            net: 90_000 - 8003,
            paidPayouts: 1,
            payouts: 90_000,
            refunds: 5000,
            spend: 8003,
        });
        expect(result.byMonth[2]).toMatchObject({
            grossOnlyPayouts: 1,
            net: 50_000,
            payouts: 50_000,
            spend: 0,
        });
    });

    it('keeps a Paid payout with no paid date in the all-time totals, out of the months, and counts it', () => {
        const result = spendAndPayouts(
            ledger({
                accounts: [a],
                payouts: [
                    payout(a, 40_000, { netCents: 36_000, paidOn: null }),
                ],
            }),
        );
        expect(result.allTime.payouts).toBe(36_000);
        expect(result.byMonth).toEqual([]);
        expect(result.undatedPaidPayouts).toBe(1);
    });

    it('ignores rows of another user', () => {
        const result = spendAndPayouts(
            ledger({
                accounts: [a],
                fees: [
                    fee(a, FeeKind.EvalPurchase, 10_000, '2026-09-01', {
                        userId: OTHER_USER_ID,
                    }),
                ],
                payouts: [payout(a, 10_000, { userId: OTHER_USER_ID })],
            }),
        );
        expect(result.allTime.spend).toBe(0);
        expect(result.allTime.payouts).toBe(0);
    });

    it('is zero for an empty ledger', () => {
        const result = spendAndPayouts(ledger({}));
        expect(result.allTime.net).toBe(0);
        expect(result.byMonth).toEqual([]);
    });
});
