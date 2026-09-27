import { describe, expect, it } from 'vitest';

import { AccountEventKind, PayoutStatus } from '~/lib/prop-accounts/core';
import { payoutTiming } from '~/lib/prop-accounts/metrics';
import { meanStandardError } from '~/lib/prop-calculator/stats';

import {
    account,
    EVAL_PLAN,
    event,
    ledger,
    meanInterval,
    payout,
    purchased,
} from './ledgerFixtures';

describe('payoutTiming', () => {
    it('gives days from funded to the first paid payout and between later payouts, per plan', () => {
        const owner = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const result = payoutTiming(
            ledger({
                accounts: [owner],
                events: [
                    purchased(owner),
                    event(owner, AccountEventKind.EvalPassed, '2026-01-05'),
                ],
                payouts: [
                    payout(owner, 40_000, {
                        paidOn: '2026-01-20',
                        status: PayoutStatus.Paid,
                    }),
                    payout(owner, 40_000, {
                        paidOn: '2026-02-19',
                        status: PayoutStatus.Paid,
                    }),
                ],
            }),
        );
        const plan = result.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(plan?.toFirstPayout).toEqual({
            interval: null,
            n: 1,
            standardError: null,
            value: 15,
        });
        expect(plan?.betweenPayouts).toEqual({
            interval: null,
            n: 1,
            standardError: null,
            value: 30,
        });
    });

    it('pools days across every account on the plan with a mean SE at n >= 2', () => {
        const first = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const second = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const result = payoutTiming(
            ledger({
                accounts: [first, second],
                events: [
                    purchased(first),
                    event(first, AccountEventKind.EvalPassed, '2026-01-05'),
                    purchased(second),
                    event(second, AccountEventKind.EvalPassed, '2026-01-05'),
                ],
                payouts: [
                    payout(first, 40_000, {
                        paidOn: '2026-01-15',
                        status: PayoutStatus.Paid,
                    }),
                    payout(second, 40_000, {
                        paidOn: '2026-01-25',
                        status: PayoutStatus.Paid,
                    }),
                ],
            }),
        );
        const plan = result.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        const se = meanStandardError(30, 500, 2);
        expect(plan?.toFirstPayout).toEqual({
            interval: meanInterval(15, se, 2),
            n: 2,
            standardError: se,
            value: 15,
        });
        expect(plan?.betweenPayouts).toBeNull();
    });

    it('excludes a paid payout dated before the funded transition rather than counting a negative lag', () => {
        const owner = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const result = payoutTiming(
            ledger({
                accounts: [owner],
                events: [
                    purchased(owner),
                    event(owner, AccountEventKind.EvalPassed, '2026-01-20'),
                ],
                payouts: [
                    payout(owner, 40_000, {
                        paidOn: '2026-01-10',
                        status: PayoutStatus.Paid,
                    }),
                    payout(owner, 40_000, {
                        paidOn: '2026-01-30',
                        status: PayoutStatus.Paid,
                    }),
                ],
            }),
        );
        const plan = result.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(plan?.toFirstPayout).toEqual({
            interval: null,
            n: 1,
            standardError: null,
            value: 10,
        });
    });

    it('is null per plan with no funded accounts or no paid payouts', () => {
        const owner = account(EVAL_PLAN);
        const result = payoutTiming(
            ledger({
                accounts: [owner],
                events: [purchased(owner)],
            }),
        );
        const plan = result.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(plan?.toFirstPayout).toBeNull();
        expect(plan?.betweenPayouts).toBeNull();
    });
});
