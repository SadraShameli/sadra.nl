import { describe, expect, it } from 'vitest';

import { FeeKind } from '~/lib/prop-accounts/core';
import {
    AVERAGE_DAYS_PER_MONTH,
    portfolioRoi,
} from '~/lib/prop-accounts/metrics';
import { RoiBasis } from '~/lib/prop-calculator';

import { account, EVAL_PLAN, fee, ledger, payout } from './ledgerFixtures';

describe('portfolioRoi', () => {
    const owner = account(EVAL_PLAN, { purchasedOn: '2026-07-01' });

    it('computes total and annualised ROI on net spend, refunds netted out', () => {
        const result = portfolioRoi(
            ledger({
                accounts: [owner],
                fees: [
                    fee(owner, FeeKind.EvalPurchase, 10_000, '2026-07-01'),
                    fee(owner, FeeKind.Refund, 2000, '2026-07-10'),
                ],
                payouts: [
                    payout(owner, 20_000, {
                        netCents: 16_000,
                        paidOn: '2026-09-01',
                    }),
                ],
            }),
            '2026-09-28',
        );
        const elapsedDays = 90;
        const monthlyNet = 8000 / (elapsedDays / AVERAGE_DAYS_PER_MONTH);
        expect(result.netSpend).toBe(8000);
        expect(result.net).toBe(8000);
        expect(result.since).toBe('2026-07-01');
        expect(result.elapsedDays).toBe(elapsedDays);
        expect(result.total).toEqual({ basis: RoiBasis.TotalOnCost, value: 1 });
        expect(result.annualised.basis).toBe(RoiBasis.AnnualisedOnCost);
        expect(result.annualised.value).toBeCloseTo(
            (monthlyNet * 12) / 8000,
            12,
        );
    });

    it('counts no fee or payout dated after the as-of date', () => {
        const result = portfolioRoi(
            ledger({
                accounts: [owner],
                fees: [
                    fee(owner, FeeKind.EvalPurchase, 10_000, '2026-07-01'),
                    fee(owner, FeeKind.Reset, 5000, '2026-10-01'),
                ],
                payouts: [
                    payout(owner, 20_000, {
                        netCents: 16_000,
                        paidOn: '2026-09-01',
                    }),
                    payout(owner, 20_000, {
                        netCents: 20_000,
                        paidOn: '2026-10-02',
                    }),
                ],
            }),
            '2026-09-28',
        );
        expect(result.netSpend).toBe(10_000);
        expect(result.net).toBe(6000);
        expect(result.total.value).toBeCloseTo(0.6, 12);
    });

    it('starts the period at the earliest purchase or fee date', () => {
        const early = account(EVAL_PLAN, { purchasedOn: '2026-09-01' });
        const result = portfolioRoi(
            ledger({
                accounts: [early],
                fees: [fee(early, FeeKind.Other, 100, '2026-08-15')],
            }),
            '2026-08-15',
        );
        expect(result.since).toBe('2026-08-15');
        expect(result.elapsedDays).toBe(1);
    });

    it('gives the payout multiple as payouts over spend, in the video style (3.51x)', () => {
        const result = portfolioRoi(
            ledger({
                accounts: [owner],
                fees: [fee(owner, FeeKind.EvalPurchase, 55_000_000, '2026-07-01')],
                payouts: [
                    payout(owner, 193_100_000, {
                        netCents: 193_100_000,
                        paidOn: '2026-09-01',
                    }),
                ],
            }),
            '2026-09-28',
        );
        expect(result.payoutMultiple).toBeCloseTo(3.51, 2);
    });

    it('is n/a at zero spend and when refunds cover every fee', () => {
        const zero = portfolioRoi(
            ledger({ accounts: [owner], payouts: [payout(owner, 5000)] }),
            '2026-09-28',
        );
        expect(zero.total.value).toBeNull();
        expect(zero.annualised.value).toBeNull();
        expect(zero.payoutMultiple).toBeNull();
        const refunded = portfolioRoi(
            ledger({
                accounts: [owner],
                fees: [
                    fee(owner, FeeKind.EvalPurchase, 10_000, '2026-07-01'),
                    fee(owner, FeeKind.Refund, 10_000, '2026-07-02'),
                ],
            }),
            '2026-09-28',
        );
        expect(refunded.netSpend).toBe(0);
        expect(refunded.total.value).toBeNull();
        expect(refunded.annualised.value).toBeNull();
    });

    it('has no annualised ROI when the as-of date precedes the first ledger date or the ledger is empty', () => {
        const before = portfolioRoi(
            ledger({
                accounts: [owner],
                fees: [fee(owner, FeeKind.EvalPurchase, 10_000, '2026-07-01')],
            }),
            '2026-06-30',
        );
        expect(before.elapsedDays).toBe(0);
        expect(before.annualised.value).toBeNull();
        expect(before.netSpend).toBe(0);
        expect(before.total.value).toBeNull();
        const empty = portfolioRoi(ledger({}), '2026-09-28');
        expect(empty.since).toBeNull();
        expect(empty.elapsedDays).toBe(0);
        expect(empty.total.value).toBeNull();
    });
});
