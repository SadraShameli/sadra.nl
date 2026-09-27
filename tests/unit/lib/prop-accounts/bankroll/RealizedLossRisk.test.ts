import { describe, expect, expectTypeOf, it } from 'vitest';

import { type RealizedLossRisk, realizedLossRisk } from '~/lib/prop-accounts/bankroll';
import { AccountEventKind, FeeKind } from '~/lib/prop-accounts/core';
import { type Dollars } from '~/lib/prop-calculator';
import { type Quantity } from '~/lib/prop-calculator/economics';

import {
    account,
    event,
    fee,
    INSTANT_PLAN,
    ledger,
    payout,
} from '../metrics/ledgerFixtures';

function fundedAccount(overrides: Parameters<typeof account>[1] = {}) {
    return account(INSTANT_PLAN, overrides);
}

describe('realizedLossRisk', () => {
    it('brands the minimum budget as Dollars, not a raw number', () => {
        expectTypeOf<
            RealizedLossRisk['minimumBudget']
        >().toEqualTypeOf<Quantity<Dollars>>();
    });

    it('is NoPositiveEdge when the realized mean net per attempt is not positive', () => {
        const acc = fundedAccount();
        const feeRow = fee(acc, FeeKind.EvalPurchase, 50_000, '2026-01-01');
        const paidRow = payout(acc, 20_000, {
            netCents: 20_000,
            paidOn: '2026-01-10',
        });
        const result = realizedLossRisk({
            asOfDate: '2026-06-01',
            attemptCostCents: 50_000,
            availableCents: 500_000,
            draws: 500,
            ledger: ledger({
                accounts: [acc],
                events: [event(acc, AccountEventKind.Purchased, '2026-01-01')],
                fees: [feeRow],
                payouts: [paidRow],
            }),
            lossRiskThreshold: null,
            seed: 1,
            toFirstPayoutFallbackDays: 30,
        });
        expect(result.reason).toBe('no-positive-edge');
        expect(result.batchLossProbability).toBeNull();
    });

    it('excludes an open attempt younger than the payout timing window', () => {
        const winner = fundedAccount();
        const winnerFee = fee(winner, FeeKind.EvalPurchase, 10_000, '2026-01-01');
        const winnerPayout = payout(winner, 50_000, {
            netCents: 50_000,
            paidOn: '2026-01-20',
        });
        const young = fundedAccount();
        const youngFee = fee(young, FeeKind.EvalPurchase, 10_000, '2026-05-25');
        const result = realizedLossRisk({
            asOfDate: '2026-06-01',
            attemptCostCents: 10_000,
            availableCents: 100_000,
            draws: 500,
            ledger: ledger({
                accounts: [winner, young],
                events: [
                    event(winner, AccountEventKind.Purchased, '2026-01-01'),
                    event(young, AccountEventKind.Purchased, '2026-05-25'),
                ],
                fees: [winnerFee, youngFee],
                payouts: [winnerPayout],
            }),
            lossRiskThreshold: null,
            seed: 1,
            toFirstPayoutFallbackDays: 30,
        });
        expect(result.attemptPaysRate?.n).toBe(1);
        expect(result.reason).toBeNull();
    });

    it('computes a positive batch-loss probability at the affordable attempt count', () => {
        const accounts = Array.from({ length: 6 }, () => fundedAccount());
        const fees = accounts.map((acc, index) =>
            fee(acc, FeeKind.EvalPurchase, 10_000, `2026-01-0${index + 1}`),
        );
        const payouts = accounts
            .slice(0, 4)
            .map((acc, index) =>
                payout(acc, 30_000, {
                    netCents: 30_000,
                    paidOn: `2026-01-1${index + 1}`,
                }),
            );
        const events = accounts.map((acc, index) =>
            event(acc, AccountEventKind.Purchased, `2026-01-0${index + 1}`),
        );
        const result = realizedLossRisk({
            asOfDate: '2026-06-01',
            attemptCostCents: 10_000,
            availableCents: 40_000,
            draws: 1000,
            ledger: ledger({ accounts, events, fees, payouts }),
            lossRiskThreshold: null,
            seed: 7,
            toFirstPayoutFallbackDays: 30,
        });
        expect(result.reason).toBeNull();
        expect(result.attempts).toBe(4);
        expect(result.batchLossProbability?.value).toBeGreaterThanOrEqual(0);
        expect(result.batchLossProbability?.value).toBeLessThanOrEqual(1);
        expect(result.noPayoutProbability).not.toBeNull();
    });

    it('reports a minimum budget under the loss-risk threshold when set', () => {
        const accounts = Array.from({ length: 6 }, () => fundedAccount());
        const fees = accounts.map((acc, index) =>
            fee(acc, FeeKind.EvalPurchase, 10_000, `2026-01-0${index + 1}`),
        );
        const payouts = accounts.map((acc, index) =>
            payout(acc, 40_000, {
                netCents: 40_000,
                paidOn: `2026-01-1${index + 1}`,
            }),
        );
        const events = accounts.map((acc, index) =>
            event(acc, AccountEventKind.Purchased, `2026-01-0${index + 1}`),
        );
        const result = realizedLossRisk({
            asOfDate: '2026-06-01',
            attemptCostCents: 10_000,
            availableCents: 1_000_000,
            draws: 500,
            ledger: ledger({ accounts, events, fees, payouts }),
            lossRiskThreshold: 0.1,
            seed: 3,
            toFirstPayoutFallbackDays: 30,
        });
        expect(result.reason).toBeNull();
        expect(result.minimumBudget.value).not.toBeNull();
    });

    it('uses the fallback days when no payout timing is measured', () => {
        const acc = fundedAccount();
        const feeRow = fee(acc, FeeKind.EvalPurchase, 10_000, '2026-01-01');
        const result = realizedLossRisk({
            asOfDate: '2026-01-05',
            attemptCostCents: 10_000,
            availableCents: 100_000,
            draws: 500,
            ledger: ledger({
                accounts: [acc],
                events: [event(acc, AccountEventKind.Purchased, '2026-01-01')],
                fees: [feeRow],
                payouts: [],
            }),
            lossRiskThreshold: null,
            seed: 1,
            toFirstPayoutFallbackDays: 45,
        });
        expect(result.toFirstPayoutDays).toBe(45);
        expect(result.toFirstPayoutMeasured).toBe(false);
    });
});
