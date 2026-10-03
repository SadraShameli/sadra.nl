import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    type RealizedLossRisk,
    realizedLossRisk,
} from '~/lib/prop-accounts/bankroll';
import {
    AccountEventKind,
    AccountStage,
    FeeKind,
} from '~/lib/prop-accounts/core';
import { type Dollars } from '~/lib/prop-calculator';
import { type Quantity } from '~/lib/prop-calculator/economics';

import {
    account,
    EVAL_PLAN,
    event,
    fee,
    INSTANT_PLAN,
    ledger,
    payout,
} from '../metrics/ledgerFixtures';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');
const THREE_POINT_COST_CENTS = 25_000;
const BOOTSTRAP_FLOOR_ATTEMPTS = 59;
const THREE_POINT_CEILING_ATTEMPTS = 100;

function fundedAccount(overrides: Parameters<typeof account>[1] = {}) {
    return account(INSTANT_PLAN, overrides);
}

function textOf(relativePath: string): string {
    return readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

describe('realizedLossRisk', () => {
    it('brands the minimum budget as Dollars, not a raw number', () => {
        expectTypeOf<RealizedLossRisk['minimumBudget']>().toEqualTypeOf<
            Quantity<Dollars>
        >();
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
        const winnerFee = fee(
            winner,
            FeeKind.EvalPurchase,
            10_000,
            '2026-01-01',
        );
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
        const payouts = accounts.slice(0, 4).map((acc, index) =>
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

describe('realizedLossRisk keys the minimum budget on the compound distribution (PT-80)', () => {
    it('needs more attempts for a 5% threshold than the one-value binomial says when realized payouts are dispersed', () => {
        const nets = [
            ...Array.from({ length: 16 }, () => 0),
            ...Array.from({ length: 3 }, () => 75_000),
            1_025_000,
        ];
        const accounts = nets.map(() => fundedAccount());
        const fees = accounts.map((acc) =>
            fee(
                acc,
                FeeKind.EvalPurchase,
                THREE_POINT_COST_CENTS,
                '2026-01-01',
            ),
        );
        const payouts = accounts.flatMap((acc, index) => {
            const net = nets[index] ?? 0;
            return net === 0
                ? []
                : [payout(acc, net, { netCents: net, paidOn: '2026-01-10' })];
        });
        const result = realizedLossRisk({
            asOfDate: '2026-06-01',
            attemptCostCents: THREE_POINT_COST_CENTS,
            availableCents: 1_000_000,
            draws: 500,
            ledger: ledger({
                accounts,
                events: accounts.map((acc) =>
                    event(acc, AccountEventKind.Purchased, '2026-01-01'),
                ),
                fees,
                payouts,
            }),
            lossRiskThreshold: 0.05,
            seed: 1,
            toFirstPayoutFallbackDays: 30,
        });
        expect(result.reason).toBeNull();
        const budget = result.minimumBudget.value;
        if (budget === null) throw new Error('no minimum budget');
        const attempts = Math.round(budget / (THREE_POINT_COST_CENTS / 100));
        expect(attempts).toBeGreaterThanOrEqual(BOOTSTRAP_FLOOR_ATTEMPTS);
        expect(attempts).toBeLessThanOrEqual(THREE_POINT_CEILING_ATTEMPTS);
    });
});

describe('realizedLossRisk pays rate counts every attempt (PT-80)', () => {
    it('counts the failed eval attempt of an ended unfunded account beside a funded attempt that paid', () => {
        const busted = account(EVAL_PLAN);
        const passed = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const result = realizedLossRisk({
            asOfDate: '2026-06-01',
            attemptCostCents: 10_000,
            availableCents: 100_000,
            draws: 500,
            ledger: ledger({
                accounts: [busted, passed],
                events: [
                    event(busted, AccountEventKind.Purchased, '2026-01-01'),
                    event(busted, AccountEventKind.Busted, '2026-01-10'),
                    event(passed, AccountEventKind.Purchased, '2026-01-01'),
                    event(passed, AccountEventKind.EvalPassed, '2026-01-05'),
                ],
                fees: [
                    fee(busted, FeeKind.EvalPurchase, 10_000, '2026-01-01'),
                    fee(passed, FeeKind.EvalPurchase, 10_000, '2026-01-01'),
                ],
                payouts: [
                    payout(passed, 50_000, {
                        netCents: 50_000,
                        paidOn: '2026-01-20',
                    }),
                ],
            }),
            lossRiskThreshold: null,
            seed: 1,
            toFirstPayoutFallbackDays: 30,
        });
        expect(result.attemptPaysRate?.n).toBe(2);
        expect(result.attemptPaysRate?.value).toBe(0.5);
    });
});

function firstPayoutResultFor(rows: Parameters<typeof ledger>[0]) {
    return realizedLossRisk({
        asOfDate: '2026-06-01',
        attemptCostCents: 10_000,
        availableCents: 100_000,
        draws: 500,
        ledger: ledger(rows),
        lossRiskThreshold: null,
        seed: 1,
        toFirstPayoutFallbackDays: 99,
    });
}

describe('realizedLossRisk measured days to first payout come from payoutTiming (PT-80)', () => {
    it('is the n-weighted mean of the plans first-payout figures', () => {
        const slow = Array.from({ length: 3 }, () => fundedAccount());
        const quick = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const result = firstPayoutResultFor({
            accounts: [...slow, quick],
            events: [
                ...slow.map((acc) =>
                    event(acc, AccountEventKind.Purchased, '2026-01-01'),
                ),
                event(quick, AccountEventKind.Purchased, '2026-01-01'),
                event(quick, AccountEventKind.EvalPassed, '2026-01-01'),
            ],
            fees: [],
            payouts: [
                ...slow.map((acc) =>
                    payout(acc, 40_000, {
                        netCents: 40_000,
                        paidOn: '2026-02-10',
                    }),
                ),
                payout(quick, 40_000, {
                    netCents: 40_000,
                    paidOn: '2026-01-11',
                }),
            ],
        });
        expect(result.toFirstPayoutMeasured).toBe(true);
        expect(result.toFirstPayoutDays).toBeCloseTo((3 * 40 + 10) / 4, 9);
    });

    it('ignores a Paid payout dated before the funded date', () => {
        const funded = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const result = firstPayoutResultFor({
            accounts: [funded],
            events: [
                event(funded, AccountEventKind.Purchased, '2026-01-01'),
                event(funded, AccountEventKind.EvalPassed, '2026-01-10'),
            ],
            fees: [],
            payouts: [
                payout(funded, 10_000, {
                    netCents: 10_000,
                    paidOn: '2026-01-05',
                }),
                payout(funded, 10_000, {
                    netCents: 10_000,
                    paidOn: '2026-01-20',
                }),
            ],
        });
        expect(result.toFirstPayoutDays).toBe(10);
    });

    it('has one first-payout day count in the accounts library, and it is not in this file', () => {
        const realized = textOf(
            'src/lib/prop-accounts/bankroll/RealizedLossRisk.ts',
        );
        const timing = textOf('src/lib/prop-accounts/metrics/PayoutTiming.ts');
        expect(realized).toMatch(/\bpayoutTiming\(/);
        expect(realized).not.toMatch(/\bisoDaysBetween\(/);
        expect(realized).not.toMatch(/\bpaidPayoutCash\(/);
        expect(timing.match(/\btoFirst\.push\(/g)).toHaveLength(1);
    });
});
