import { describe, expect, it } from 'vitest';

import {
    bankrollOf,
    scaleAtMeasuredMultiple,
    ScaleAtMultipleKind,
    ScaleAtMultipleReason,
    ScaleBudgetBasis,
    ScaleCappedBy,
} from '~/lib/prop-accounts/bankroll';
import {
    AccountEventKind,
    BankrollTransferKind,
    FeeKind,
    PayoutStatus,
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
    minEndedAccounts: null,
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
                    payout(acc, 30_000, {
                        netCents: 30_000,
                        paidOn: '2026-01-10',
                    }),
                ],
                transfers: [
                    transfer(
                        BankrollTransferKind.Deposit,
                        200_000,
                        '2025-12-01',
                    ),
                    transfer(
                        BankrollTransferKind.Withdrawal,
                        20_000,
                        '2026-01-15',
                    ),
                ],
            }),
            '2026-06-01',
        );
        expect(result.depositsCents).toBe(200_000);
        expect(result.withdrawalsCents).toBe(20_000);
        expect(result.reinvestedPayoutsCents).toBe(0);
        expect(result).not.toHaveProperty('grownFromCents');
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
                    transfer(
                        BankrollTransferKind.Deposit,
                        200_000,
                        '2026-01-01',
                    ),
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

const MULTIPLE = { interval: { lower: 0.5, upper: 2 }, n: 3, value: 1.5 };

const NO_BUDGETS = {
    capacityFillCents: null,
    enteredMonthlyCents: null,
    planLimitCents: null,
};

function reinvestingLedger() {
    const acc = account(EVAL_PLAN);
    return ledger({
        accounts: [acc],
        events: [event(acc, AccountEventKind.Purchased, '2026-01-01')],
        fees: [fee(acc, FeeKind.EvalPurchase, 15_000, '2026-01-01')],
        payouts: [
            payout(acc, 20_000, {
                netCents: 20_000,
                paidOn: '2026-01-10',
            }),
        ],
        transfers: [
            transfer(BankrollTransferKind.Deposit, 10_000, '2025-12-01'),
            transfer(BankrollTransferKind.Withdrawal, 2000, '2026-01-15'),
        ],
    });
}

describe('bankrollOf reinvested payouts and as-of date', () => {
    it('reports the part of the spend that payouts funded beyond the injected capital', () => {
        const result = bankrollOf(reinvestingLedger(), '2026-06-01');
        expect(result.reinvestedPayoutsCents).toBe(5000);
        expect(result.availableCents).toBe(13_000);
        expect(result.depositsCents).toBe(10_000);
    });

    it('caps reinvested payouts at the Paid payout cash', () => {
        const acc = account(EVAL_PLAN);
        const result = bankrollOf(
            ledger({
                accounts: [acc],
                fees: [fee(acc, FeeKind.EvalPurchase, 50_000, '2026-01-01')],
                payouts: [
                    payout(acc, 8000, { netCents: 8000, paidOn: '2026-01-10' }),
                ],
                transfers: [
                    transfer(
                        BankrollTransferKind.Deposit,
                        10_000,
                        '2025-12-01',
                    ),
                ],
            }),
            '2026-06-01',
        );
        expect(result.reinvestedPayoutsCents).toBe(8000);
        expect(result.availableCents).toBe(10_000 + 8000 - 50_000);
    });

    it('reports zero reinvested payouts while the deposits cover the spend', () => {
        const acc = account(EVAL_PLAN);
        const result = bankrollOf(
            ledger({
                accounts: [acc],
                fees: [fee(acc, FeeKind.EvalPurchase, 5000, '2026-01-01')],
                payouts: [
                    payout(acc, 8000, { netCents: 8000, paidOn: '2026-01-10' }),
                ],
                transfers: [
                    transfer(
                        BankrollTransferKind.Deposit,
                        10_000,
                        '2025-12-01',
                    ),
                ],
            }),
            '2026-06-01',
        );
        expect(result.reinvestedPayoutsCents).toBe(0);
    });

    it('reports a Paid payout with no paid date as undated and keeps it out of the dated cash', () => {
        const acc = account(EVAL_PLAN);
        const result = bankrollOf(
            ledger({
                accounts: [acc],
                fees: [fee(acc, FeeKind.EvalPurchase, 15_000, '2026-01-01')],
                payouts: [
                    payout(acc, 20_000, {
                        netCents: 20_000,
                        paidOn: '2026-01-10',
                    }),
                    payout(acc, 30_000, { netCents: 30_000, paidOn: null }),
                    payout(acc, 40_000, {
                        netCents: 40_000,
                        paidOn: null,
                        status: PayoutStatus.Requested,
                    }),
                ],
                transfers: [
                    transfer(
                        BankrollTransferKind.Deposit,
                        10_000,
                        '2025-12-01',
                    ),
                ],
            }),
            '2026-06-01',
        );
        expect(result.undatedPaidPayouts).toBe(1);
        expect(result.availableCents).toBe(10_000 + 20_000 - 15_000);
        expect(result.reinvestedPayoutsCents).toBe(5000);
    });

    it('reports no undated Paid payouts when every one has a date', () => {
        expect(bankrollOf(reinvestingLedger(), '2026-06-01')).toMatchObject({
            undatedPaidPayouts: 0,
        });
    });

    it('excludes deposits, withdrawals, fees and Paid payouts dated after the as-of date', () => {
        const acc = account(EVAL_PLAN);
        const result = bankrollOf(
            ledger({
                accounts: [acc],
                fees: [
                    fee(acc, FeeKind.EvalPurchase, 15_000, '2026-01-01'),
                    fee(acc, FeeKind.Reset, 7000, '2026-07-01'),
                ],
                payouts: [
                    payout(acc, 20_000, {
                        netCents: 20_000,
                        paidOn: '2026-01-10',
                    }),
                    payout(acc, 90_000, {
                        netCents: 90_000,
                        paidOn: '2026-07-02',
                    }),
                ],
                transfers: [
                    transfer(
                        BankrollTransferKind.Deposit,
                        10_000,
                        '2025-12-01',
                    ),
                    transfer(
                        BankrollTransferKind.Deposit,
                        500_000,
                        '2026-07-03',
                    ),
                    transfer(
                        BankrollTransferKind.Withdrawal,
                        2000,
                        '2026-01-15',
                    ),
                    transfer(
                        BankrollTransferKind.Withdrawal,
                        40_000,
                        '2026-07-04',
                    ),
                ],
            }),
            '2026-06-01',
        );
        expect(result.depositsCents).toBe(10_000);
        expect(result.withdrawalsCents).toBe(2000);
        expect(result.availableCents).toBe(13_000);
        expect(result.reinvestedPayoutsCents).toBe(5000);
    });
});

describe('scaleAtMeasuredMultiple', () => {
    it('is unavailable with a reason when no account has ended', () => {
        const result = scaleAtMeasuredMultiple(
            null,
            { ...NO_BUDGETS, capacityFillCents: 500_000 },
            THRESHOLDS,
        );
        expect(result).toEqual({
            kind: ScaleAtMultipleKind.Unavailable,
            reason: ScaleAtMultipleReason.NoEndedAccounts,
        });
    });

    it('is unavailable with a reason when no budget is set', () => {
        const result = scaleAtMeasuredMultiple(
            MULTIPLE,
            NO_BUDGETS,
            THRESHOLDS,
        );
        expect(result).toEqual({
            kind: ScaleAtMultipleKind.Unavailable,
            reason: ScaleAtMultipleReason.CapacityNotSet,
        });
    });

    it('projects an entered monthly budget below the capacity fill as a monthly figure', () => {
        const result = scaleAtMeasuredMultiple(
            MULTIPLE,
            {
                capacityFillCents: 500_000,
                enteredMonthlyCents: 400_000,
                planLimitCents: null,
            },
            THRESHOLDS,
        );
        expect(result).toMatchObject({
            budgetBasis: ScaleBudgetBasis.EnteredMonthly,
            budgetCents: 400_000,
            cappedBy: null,
            kind: ScaleAtMultipleKind.Available,
            multiple: 1.5,
            n: 3,
            projectedCents: 600_000,
            projectedMonthlyCents: 600_000,
        });
    });

    it('caps an entered budget above the capacity fill at the capacity fill and labels it that way', () => {
        const result = scaleAtMeasuredMultiple(
            MULTIPLE,
            {
                capacityFillCents: 12_000,
                enteredMonthlyCents: 20_000,
                planLimitCents: null,
            },
            THRESHOLDS,
        );
        expect(result).toMatchObject({
            budgetBasis: ScaleBudgetBasis.CapacityFill,
            budgetCents: 12_000,
            cappedBy: ScaleCappedBy.Capacity,
            projectedCents: 18_000,
            projectedMonthlyCents: null,
        });
    });

    it('labels the projection one capacity fill, not a monthly budget, when none is entered', () => {
        const result = scaleAtMeasuredMultiple(
            MULTIPLE,
            { ...NO_BUDGETS, capacityFillCents: 12_000 },
            THRESHOLDS,
        );
        expect(result).toMatchObject({
            budgetBasis: ScaleBudgetBasis.CapacityFill,
            budgetCents: 12_000,
            cappedBy: null,
            projectedCents: 18_000,
            projectedMonthlyCents: null,
        });
    });

    it('uses the plan-limit budget when it is the least, and names the plan limits as the cap of an entered budget', () => {
        const unentered = scaleAtMeasuredMultiple(
            MULTIPLE,
            {
                capacityFillCents: 12_000,
                enteredMonthlyCents: null,
                planLimitCents: 8000,
            },
            THRESHOLDS,
        );
        expect(unentered).toMatchObject({
            budgetBasis: ScaleBudgetBasis.PlanLimit,
            budgetCents: 8000,
            cappedBy: null,
            projectedCents: 12_000,
            projectedMonthlyCents: null,
        });
        const entered = scaleAtMeasuredMultiple(
            MULTIPLE,
            {
                capacityFillCents: 12_000,
                enteredMonthlyCents: 20_000,
                planLimitCents: 8000,
            },
            THRESHOLDS,
        );
        expect(entered).toMatchObject({
            budgetBasis: ScaleBudgetBasis.PlanLimit,
            budgetCents: 8000,
            cappedBy: ScaleCappedBy.PlanLimits,
            projectedMonthlyCents: null,
        });
    });

    it('prefers the capacity fill when the capacity fill and plan limit tie', () => {
        const result = scaleAtMeasuredMultiple(
            MULTIPLE,
            {
                capacityFillCents: 8000,
                enteredMonthlyCents: 20_000,
                planLimitCents: 8000,
            },
            THRESHOLDS,
        );
        expect(result).toMatchObject({
            budgetBasis: ScaleBudgetBasis.CapacityFill,
            cappedBy: ScaleCappedBy.Capacity,
        });
    });

    it('treats an entered budget equal to the limit as monthly and uncapped', () => {
        const result = scaleAtMeasuredMultiple(
            MULTIPLE,
            {
                capacityFillCents: 12_000,
                enteredMonthlyCents: 12_000,
                planLimitCents: null,
            },
            THRESHOLDS,
        );
        expect(result).toMatchObject({
            budgetBasis: ScaleBudgetBasis.EnteredMonthly,
            cappedBy: null,
            projectedMonthlyCents: 18_000,
        });
    });

    it('uses an entered budget alone when no limit is set', () => {
        const result = scaleAtMeasuredMultiple(
            MULTIPLE,
            { ...NO_BUDGETS, enteredMonthlyCents: 10_000 },
            THRESHOLDS,
        );
        expect(result).toMatchObject({
            budgetBasis: ScaleBudgetBasis.EnteredMonthly,
            cappedBy: null,
            projectedMonthlyCents: 15_000,
        });
    });

    it('treats a zero, negative or fractional budget as not set', () => {
        for (const bad of [0, -5000, 1.5, NaN]) {
            expect(
                scaleAtMeasuredMultiple(
                    MULTIPLE,
                    { ...NO_BUDGETS, capacityFillCents: bad },
                    THRESHOLDS,
                ),
            ).toEqual({
                kind: ScaleAtMultipleKind.Unavailable,
                reason: ScaleAtMultipleReason.CapacityNotSet,
            });
            expect(
                scaleAtMeasuredMultiple(
                    MULTIPLE,
                    { ...NO_BUDGETS, planLimitCents: bad },
                    THRESHOLDS,
                ),
            ).toMatchObject({
                kind: ScaleAtMultipleKind.Unavailable,
                reason: ScaleAtMultipleReason.CapacityNotSet,
            });
            expect(
                scaleAtMeasuredMultiple(
                    MULTIPLE,
                    { ...NO_BUDGETS, enteredMonthlyCents: bad },
                    THRESHOLDS,
                ),
            ).toMatchObject({
                kind: ScaleAtMultipleKind.Unavailable,
                reason: ScaleAtMultipleReason.CapacityNotSet,
            });
        }
    });

    it('falls back to the capacity fill when the entered budget is zero, and to the plan limit when the capacity fill is zero', () => {
        expect(
            scaleAtMeasuredMultiple(
                MULTIPLE,
                {
                    capacityFillCents: 12_000,
                    enteredMonthlyCents: 0,
                    planLimitCents: null,
                },
                THRESHOLDS,
            ),
        ).toMatchObject({
            budgetBasis: ScaleBudgetBasis.CapacityFill,
            budgetCents: 12_000,
            projectedCents: 18_000,
            projectedMonthlyCents: null,
        });
        expect(
            scaleAtMeasuredMultiple(
                MULTIPLE,
                {
                    capacityFillCents: 0,
                    enteredMonthlyCents: null,
                    planLimitCents: 8000,
                },
                THRESHOLDS,
            ),
        ).toMatchObject({
            budgetBasis: ScaleBudgetBasis.PlanLimit,
            budgetCents: 8000,
        });
    });

    it('is null with no sample threshold set for ended accounts', () => {
        const result = scaleAtMeasuredMultiple(
            MULTIPLE,
            { ...NO_BUDGETS, capacityFillCents: 400_000 },
            THRESHOLDS,
        );
        expect(result).toMatchObject({ sampleLevel: null });
    });

    it('labels the sample level against the funded-accounts threshold, since ended accounts are a subset of ever-funded accounts', () => {
        const result = scaleAtMeasuredMultiple(
            MULTIPLE,
            { ...NO_BUDGETS, capacityFillCents: 400_000 },
            { ...THRESHOLDS, minFundedAccounts: 5 },
        );
        expect(result).toMatchObject({ sampleLevel: 'low' });
    });
});
