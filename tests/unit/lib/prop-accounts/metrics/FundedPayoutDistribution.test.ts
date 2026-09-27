import { describe, expect, it } from 'vitest';

import { AccountEventKind, PayoutStatus } from '~/lib/prop-accounts/core';
import {
    fundedPayoutDistribution,
    PAYOUT_COUNT_CAP,
} from '~/lib/prop-accounts/metrics';

import { account, EVAL_PLAN, event, ledger, payout, purchased } from './ledgerFixtures';

describe('fundedPayoutDistribution', () => {
    it('counts funded accounts by their number of Paid payouts within the horizon, cohort-matured accounts only', () => {
        const zeroPayouts = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const onePayout = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const twoPayouts = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const stillYoung = account(EVAL_PLAN, { purchasedOn: '2026-08-01' });
        const result = fundedPayoutDistribution(
            ledger({
                accounts: [zeroPayouts, onePayout, twoPayouts, stillYoung],
                events: [
                    purchased(zeroPayouts),
                    event(zeroPayouts, AccountEventKind.EvalPassed, '2026-01-05'),
                    purchased(onePayout),
                    event(onePayout, AccountEventKind.EvalPassed, '2026-01-05'),
                    purchased(twoPayouts),
                    event(twoPayouts, AccountEventKind.EvalPassed, '2026-01-05'),
                    purchased(stillYoung),
                    event(stillYoung, AccountEventKind.EvalPassed, '2026-08-05'),
                ],
                payouts: [
                    payout(onePayout, 40_000, {
                        netCents: 40_000,
                        paidOn: '2026-01-20',
                        status: PayoutStatus.Paid,
                    }),
                    payout(twoPayouts, 20_000, {
                        netCents: 20_000,
                        paidOn: '2026-01-15',
                        status: PayoutStatus.Paid,
                    }),
                    payout(twoPayouts, 30_000, {
                        netCents: 30_000,
                        paidOn: '2026-01-25',
                        status: PayoutStatus.Paid,
                    }),
                ],
            }),
            '2026-09-01',
            30,
        );
        const plan = result.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(plan?.counts[0]).toBe(1);
        expect(plan?.counts[1]).toBe(1);
        expect(plan?.counts[2]).toBe(1);
        expect(plan?.openAccounts).toBe(1);
    });

    it('caps the payout count bucket at 10', () => {
        const owner = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const many = Array.from({ length: 11 }, (_, index) =>
            payout(owner, 1000, {
                netCents: 1000,
                paidOn: `2026-01-${String(2 + index).padStart(2, '0')}`,
                status: PayoutStatus.Paid,
            }),
        );
        const result = fundedPayoutDistribution(
            ledger({
                accounts: [owner],
                events: [
                    purchased(owner),
                    event(owner, AccountEventKind.EvalPassed, '2026-01-01'),
                ],
                payouts: many,
            }),
            '2026-09-01',
            30,
        );
        const plan = result.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(plan?.counts[PAYOUT_COUNT_CAP]).toBe(1);
        expect(plan?.counts.length).toBe(PAYOUT_COUNT_CAP + 1);
    });

    it('gives the realized funded value as the mean net paid cents within the horizon, with the shared sampledMean SE and interval', () => {
        const first = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const second = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const result = fundedPayoutDistribution(
            ledger({
                accounts: [first, second],
                events: [
                    purchased(first),
                    event(first, AccountEventKind.EvalPassed, '2026-01-01'),
                    purchased(second),
                    event(second, AccountEventKind.EvalPassed, '2026-01-01'),
                ],
                payouts: [
                    payout(first, 10_000, {
                        netCents: 10_000,
                        paidOn: '2026-01-10',
                        status: PayoutStatus.Paid,
                    }),
                    payout(second, 30_000, {
                        netCents: 30_000,
                        paidOn: '2026-01-10',
                        status: PayoutStatus.Paid,
                    }),
                ],
            }),
            '2026-09-01',
            30,
        );
        const plan = result.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(plan?.realizedFundedValue?.value).toBe(20_000);
        expect(plan?.realizedFundedValue?.n).toBe(2);
        expect(plan?.realizedFundedValue?.standardError).toBeCloseTo(
            10_000,
            6,
        );
        expect(plan?.realizedFundedValue?.interval).not.toBeNull();
    });

    it('counts a funded account that busted early instead of treating it as open', () => {
        const owner = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const result = fundedPayoutDistribution(
            ledger({
                accounts: [owner],
                events: [
                    purchased(owner),
                    event(owner, AccountEventKind.EvalPassed, '2026-01-05'),
                    event(owner, AccountEventKind.Busted, '2026-01-10'),
                ],
            }),
            '2026-01-15',
            30,
        );
        const plan = result.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(plan?.counts[0]).toBe(1);
        expect(plan?.openAccounts).toBe(0);
    });

    it('is null for a plan with no cohort-matured funded accounts', () => {
        const owner = account(EVAL_PLAN, { purchasedOn: '2026-08-20' });
        const result = fundedPayoutDistribution(
            ledger({
                accounts: [owner],
                events: [
                    purchased(owner),
                    event(owner, AccountEventKind.EvalPassed, '2026-08-20'),
                ],
            }),
            '2026-09-01',
            30,
        );
        const plan = result.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(plan?.realizedFundedValue).toBeNull();
        expect(plan?.openAccounts).toBe(1);
    });

    it('reports the horizon on the result', () => {
        const result = fundedPayoutDistribution(ledger({}), '2026-09-01', 30);
        expect(result.horizonDays).toBe(30);
        expect(result.perPlan).toEqual([]);
    });
});
