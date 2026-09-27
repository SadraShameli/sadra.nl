import { describe, expect, it } from 'vitest';

import { bankrollOf, scaleAtMeasuredMultiple } from '~/lib/prop-accounts/bankroll';
import {
    AccountEventKind,
    BankrollTransferKind,
    FeeKind,
} from '~/lib/prop-accounts/core';

import {
    account,
    EVAL_PLAN,
    event,
    fee,
    ledger,
    payout,
    transfer,
} from '../metrics/ledgerFixtures';

const THRESHOLDS = {
    minClosedRounds: null,
    minEvalAttempts: null,
    minFundedAccounts: null,
    minTrades: null,
};

describe('bankrollOf', () => {
    it('computes available cents as deposits plus paid payout cash minus spend minus withdrawals', () => {
        const acc = account(EVAL_PLAN);
        const result = bankrollOf(
            ledger({
                accounts: [acc],
                events: [event(acc, AccountEventKind.Purchased, '2026-01-01')],
                fees: [fee(acc, FeeKind.EvalPurchase, 50_000, '2026-01-01')],
                payouts: [
                    payout(acc, 30_000, { netCents: 30_000, paidOn: '2026-01-10' }),
                ],
                transfers: [
                    transfer(BankrollTransferKind.Deposit, 200_000, '2025-12-01'),
                    transfer(BankrollTransferKind.Withdrawal, 20_000, '2026-01-15'),
                ],
            }),
            '2026-06-01',
        );
        expect(result.depositsCents).toBe(200_000);
        expect(result.withdrawalsCents).toBe(20_000);
        expect(result.grownFromCents).toBe(200_000);
        expect(result.availableCents).toBe(200_000 + 30_000 - 50_000 - 20_000);
    });

    it('computes a money-weighted return over the dated cashflows', () => {
        const acc = account(EVAL_PLAN);
        const result = bankrollOf(
            ledger({
                accounts: [acc],
                events: [event(acc, AccountEventKind.Purchased, '2026-01-01')],
                fees: [],
                payouts: [],
                transfers: [
                    transfer(BankrollTransferKind.Deposit, 200_000, '2026-01-01'),
                ],
            }),
            '2026-04-11',
        );
        expect(result.moneyWeightedReturn).not.toBeNull();
        expect(result.moneyWeightedReturn ?? 0).toBeGreaterThan(0);
    });

    it('is null money-weighted return with no deposits at all', () => {
        const result = bankrollOf(ledger({}), '2026-01-01');
        expect(result.moneyWeightedReturn).toBeNull();
        expect(result.availableCents).toBe(0);
    });
});

describe('scaleAtMeasuredMultiple', () => {
    it('is unavailable with a reason when no account has ended', () => {
        const result = scaleAtMeasuredMultiple(null, 500_000, THRESHOLDS);
        expect(result).toEqual({
            kind: 'unavailable',
            reason: 'no-ended-accounts',
        });
    });

    it('is unavailable with a reason when the capacity is not set', () => {
        const result = scaleAtMeasuredMultiple(
            { interval: { lower: 0.5, upper: 2 }, n: 3, value: 1.5 },
            null,
            THRESHOLDS,
        );
        expect(result).toEqual({
            kind: 'unavailable',
            reason: 'capacity-not-set',
        });
    });

    it('projects the candidate budget at the measured multiple when both are available', () => {
        const result = scaleAtMeasuredMultiple(
            { interval: { lower: 0.5, upper: 2 }, n: 3, value: 1.5 },
            400_000,
            THRESHOLDS,
        );
        expect(result).toMatchObject({
            candidateMonthlyBudgetCents: 400_000,
            kind: 'available',
            multiple: 1.5,
            n: 3,
            projectedMonthlyCents: 600_000,
        });
    });

    it('never labels the sample with a kind it does not measure', () => {
        const result = scaleAtMeasuredMultiple(
            { interval: { lower: 0.5, upper: 2 }, n: 3, value: 1.5 },
            400_000,
            { ...THRESHOLDS, minFundedAccounts: 5 },
        );
        expect(result).toMatchObject({ sampleLevel: null });
    });
});
