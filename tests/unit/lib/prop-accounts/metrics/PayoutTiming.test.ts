import { describe, expect, it } from 'vitest';

import {
    AccountEventKind,
    AccountStatus,
    PayoutStatus,
} from '~/lib/prop-accounts/core';
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

const TODAY = '2026-06-01';

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
            TODAY,
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
            TODAY,
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
            TODAY,
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
            TODAY,
        );
        const plan = result.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(plan?.toFirstPayout).toBeNull();
        expect(plan?.betweenPayouts).toBeNull();
    });

    it('counts funded accounts without a paid payout and the age of the oldest, kept out of the mean', () => {
        const paidFirst = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const paidSecond = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const waiting = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const result = payoutTiming(
            ledger({
                accounts: [paidFirst, paidSecond, waiting],
                events: [
                    purchased(paidFirst),
                    event(paidFirst, AccountEventKind.EvalPassed, '2026-01-05'),
                    purchased(paidSecond),
                    event(
                        paidSecond,
                        AccountEventKind.EvalPassed,
                        '2026-01-05',
                    ),
                    purchased(waiting),
                    event(waiting, AccountEventKind.EvalPassed, '2026-03-03'),
                ],
                payouts: [
                    payout(paidFirst, 40_000, {
                        paidOn: '2026-01-15',
                        status: PayoutStatus.Paid,
                    }),
                    payout(paidSecond, 40_000, {
                        paidOn: '2026-01-25',
                        status: PayoutStatus.Paid,
                    }),
                ],
            }),
            TODAY,
        );
        const plan = result.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(plan?.toFirstPayout?.n).toBe(2);
        expect(plan?.toFirstPayout?.value).toBe(15);
        expect(plan?.fundedWithoutPayout).toBe(1);
        expect(plan?.oldestUnpaidDays).toBe(90);
    });

    it('takes the oldest wait across several unpaid accounts', () => {
        const older = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const newer = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const result = payoutTiming(
            ledger({
                accounts: [older, newer],
                events: [
                    purchased(older),
                    event(older, AccountEventKind.EvalPassed, '2026-02-01'),
                    purchased(newer),
                    event(newer, AccountEventKind.EvalPassed, '2026-05-01'),
                ],
            }),
            TODAY,
        );
        const plan = result.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(plan?.fundedWithoutPayout).toBe(2);
        expect(plan?.oldestUnpaidDays).toBe(120);
    });

    it('has no unpaid funded accounts when every funded account has paid, and ignores accounts still in the eval', () => {
        const paid = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const inEval = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const result = payoutTiming(
            ledger({
                accounts: [paid, inEval],
                events: [
                    purchased(paid),
                    event(paid, AccountEventKind.EvalPassed, '2026-01-05'),
                    purchased(inEval),
                ],
                payouts: [
                    payout(paid, 40_000, {
                        paidOn: '2026-01-15',
                        status: PayoutStatus.Paid,
                    }),
                ],
            }),
            TODAY,
        );
        const plan = result.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(plan?.fundedWithoutPayout).toBe(0);
        expect(plan?.oldestUnpaidDays).toBeNull();
    });

    it('treats a funded account whose only paid payout predates funding as not paid yet', () => {
        const owner = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const result = payoutTiming(
            ledger({
                accounts: [owner],
                events: [
                    purchased(owner),
                    event(owner, AccountEventKind.EvalPassed, '2026-05-02'),
                ],
                payouts: [
                    payout(owner, 40_000, {
                        paidOn: '2026-05-01',
                        status: PayoutStatus.Paid,
                    }),
                ],
            }),
            TODAY,
        );
        const plan = result.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(plan?.toFirstPayout).toBeNull();
        expect(plan?.fundedWithoutPayout).toBe(1);
        expect(plan?.oldestUnpaidDays).toBe(30);
    });

    it('does not report a negative wait for an account funded after today', () => {
        const owner = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const result = payoutTiming(
            ledger({
                accounts: [owner],
                events: [
                    purchased(owner),
                    event(owner, AccountEventKind.EvalPassed, '2026-06-10'),
                ],
            }),
            TODAY,
        );
        const plan = result.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(plan?.oldestUnpaidDays).toBe(0);
    });

    it('keeps an ended funded account that never paid out of the wait and counts it separately', () => {
        const waiting = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const busted = account(EVAL_PLAN, {
            purchasedOn: '2026-01-01',
            status: AccountStatus.Busted,
        });
        const closed = account(EVAL_PLAN, {
            purchasedOn: '2026-01-01',
            status: AccountStatus.Closed,
        });
        const result = payoutTiming(
            ledger({
                accounts: [waiting, busted, closed],
                events: [
                    purchased(waiting),
                    event(waiting, AccountEventKind.EvalPassed, '2026-05-02'),
                    purchased(busted),
                    event(busted, AccountEventKind.EvalPassed, '2026-01-05'),
                    purchased(closed),
                    event(closed, AccountEventKind.EvalPassed, '2026-02-05'),
                ],
            }),
            TODAY,
        );
        const plan = result.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(plan?.fundedWithoutPayout).toBe(1);
        expect(plan?.oldestUnpaidDays).toBe(30);
        expect(plan?.endedWithoutPayout).toBe(2);
    });

    it('has no oldest wait when only ended accounts never paid, and still waits on a suspended account', () => {
        const busted = account(EVAL_PLAN, {
            purchasedOn: '2026-01-01',
            status: AccountStatus.Busted,
        });
        const suspended = account(EVAL_PLAN, {
            purchasedOn: '2026-01-01',
            status: AccountStatus.Suspended,
        });
        const onlyEnded = payoutTiming(
            ledger({
                accounts: [busted],
                events: [
                    purchased(busted),
                    event(busted, AccountEventKind.EvalPassed, '2026-01-05'),
                ],
            }),
            TODAY,
        ).perPlan.find((p) => p.planSerial === EVAL_PLAN.serial);
        expect(onlyEnded?.fundedWithoutPayout).toBe(0);
        expect(onlyEnded?.oldestUnpaidDays).toBeNull();
        expect(onlyEnded?.endedWithoutPayout).toBe(1);
        const held = payoutTiming(
            ledger({
                accounts: [suspended],
                events: [
                    purchased(suspended),
                    event(suspended, AccountEventKind.EvalPassed, '2026-05-02'),
                ],
            }),
            TODAY,
        ).perPlan.find((p) => p.planSerial === EVAL_PLAN.serial);
        expect(held?.fundedWithoutPayout).toBe(1);
        expect(held?.endedWithoutPayout).toBe(0);
    });
});
