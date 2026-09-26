import { describe, expect, it } from 'vitest';

import { AccountEventKind, AccountStatus, FeeKind } from '~/lib/prop-accounts/core';
import {
    cohortByPurchaseWindow,
    pooledEndedCohortMultiple,
    purchaseCohorts,
} from '~/lib/prop-accounts/metrics';

import {
    account,
    EVAL_PLAN,
    event,
    fee,
    ledger,
    payout,
    purchased,
} from './ledgerFixtures';

function twoAccountCohort() {
    const ended = account(EVAL_PLAN, {
        purchasedOn: '2026-06-05',
        status: AccountStatus.Busted,
    });
    const open = account(EVAL_PLAN, { purchasedOn: '2026-06-10' });
    return ledger({
        accounts: [ended, open],
        events: [
            purchased(ended),
            event(ended, AccountEventKind.Busted, '2026-06-08'),
            purchased(open),
        ],
        fees: [
            fee(ended, FeeKind.EvalPurchase, 10_000, '2026-06-05'),
            fee(open, FeeKind.EvalPurchase, 10_000, '2026-06-10'),
        ],
        payouts: [
            payout(ended, 40_000, { netCents: 40_000, paidOn: '2026-06-20' }),
        ],
    });
}

describe('cohortByPurchaseWindow', () => {
    it('gives spend, payouts, the to-date multiple and in-progress count for the accounts purchased in the window', () => {
        const portfolio = twoAccountCohort();
        const cohort = cohortByPurchaseWindow(
            portfolio,
            '2026-06-01',
            '2026-06-30',
        );
        expect(cohort.spend).toBe(20_000);
        expect(cohort.payouts).toBe(40_000);
        expect(cohort.toDateMultiple).toBeCloseTo(2, 6);
        expect(cohort.inProgressCount).toBe(1);
        expect(cohort.endedAccounts).toBe(1);
    });

    it('gives a realized multiple over ended accounts only, with a bootstrap interval and n, deterministic across calls', () => {
        const portfolio = twoAccountCohort();
        const first = cohortByPurchaseWindow(
            portfolio,
            '2026-06-01',
            '2026-06-30',
        );
        const second = cohortByPurchaseWindow(
            portfolio,
            '2026-06-01',
            '2026-06-30',
        );
        expect(first.realizedMultiple).toEqual(second.realizedMultiple);
        expect(first.realizedMultiple).toMatchObject({ n: 1, value: 4 });
        expect(first.realizedMultiple?.interval.lower).toBeLessThanOrEqual(4);
        expect(first.realizedMultiple?.interval.upper).toBeGreaterThanOrEqual(
            4,
        );
    });

    it('gives a null realized multiple value, not zero, for an ended zero-spend account with a paid payout', () => {
        const paidWithNoFee = account(EVAL_PLAN, {
            purchasedOn: '2026-06-01',
            status: AccountStatus.Busted,
        });
        const cohort = cohortByPurchaseWindow(
            ledger({
                accounts: [paidWithNoFee],
                events: [
                    purchased(paidWithNoFee),
                    event(paidWithNoFee, AccountEventKind.Busted, '2026-06-10'),
                ],
                payouts: [
                    payout(paidWithNoFee, 100_000, {
                        netCents: 100_000,
                        paidOn: '2026-06-05',
                    }),
                ],
            }),
            '2026-06-01',
            '2026-06-30',
        );
        expect(cohort.realizedMultiple).toMatchObject({ n: 1, value: null });
    });

    it('has no realized multiple without an ended account', () => {
        const open = account(EVAL_PLAN, { purchasedOn: '2026-06-01' });
        const cohort = cohortByPurchaseWindow(
            ledger({
                accounts: [open],
                events: [purchased(open)],
                fees: [fee(open, FeeKind.EvalPurchase, 10_000, '2026-06-01')],
            }),
            '2026-06-01',
            '2026-06-30',
        );
        expect(cohort.realizedMultiple).toBeNull();
        expect(cohort.toDateMultiple).toBe(0);
    });

    it('gives a null to-date multiple, not zero, for a payout with no recorded spend', () => {
        const paidWithNoFee = account(EVAL_PLAN, { purchasedOn: '2026-06-01' });
        const cohort = cohortByPurchaseWindow(
            ledger({
                accounts: [paidWithNoFee],
                events: [purchased(paidWithNoFee)],
                payouts: [
                    payout(paidWithNoFee, 100_000, {
                        netCents: 100_000,
                        paidOn: '2026-06-15',
                    }),
                ],
            }),
            '2026-06-01',
            '2026-06-30',
        );
        expect(cohort.spend).toBe(0);
        expect(cohort.payouts).toBe(100_000);
        expect(cohort.toDateMultiple).toBeNull();
    });
});

describe('purchaseCohorts', () => {
    it('buckets every month from the first purchase to the as-of month', () => {
        const portfolio = twoAccountCohort();
        const cohorts = purchaseCohorts(portfolio, '2026-07-01');
        expect(cohorts.map((c) => c.month)).toEqual(['2026-06', '2026-07']);
        expect(cohorts[1]).toMatchObject({
            endedAccounts: 0,
            inProgressCount: 0,
            payouts: 0,
            spend: 0,
        });
    });
});

describe('pooledEndedCohortMultiple', () => {
    it('pools every ended account across the ledger', () => {
        const portfolio = twoAccountCohort();
        const pooled = pooledEndedCohortMultiple(portfolio);
        expect(pooled).toMatchObject({ n: 1, value: 4 });
    });

    it('is null without any ended account', () => {
        const open = account(EVAL_PLAN, { purchasedOn: '2026-06-01' });
        const pooled = pooledEndedCohortMultiple(
            ledger({ accounts: [open], events: [purchased(open)] }),
        );
        expect(pooled).toBeNull();
    });
});
