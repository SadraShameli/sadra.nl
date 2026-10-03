import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { AccountEventKind, PayoutStatus } from '~/lib/prop-accounts/core';
import {
    fundedPayoutDistribution,
    PAYOUT_COUNT_CAP,
} from '~/lib/prop-accounts/metrics';
import { FUNDED_PAYOUT_COUNT_TAIL_BUCKET } from '~/lib/prop-calculator';

import {
    account,
    EVAL_PLAN,
    event,
    ledger,
    payout,
    purchased,
} from './ledgerFixtures';

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
                    event(
                        zeroPayouts,
                        AccountEventKind.EvalPassed,
                        '2026-01-05',
                    ),
                    purchased(onePayout),
                    event(onePayout, AccountEventKind.EvalPassed, '2026-01-05'),
                    purchased(twoPayouts),
                    event(
                        twoPayouts,
                        AccountEventKind.EvalPassed,
                        '2026-01-05',
                    ),
                    purchased(stillYoung),
                    event(
                        stillYoung,
                        AccountEventKind.EvalPassed,
                        '2026-08-05',
                    ),
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
        expect(plan?.realizedFundedValue?.standardError).toBeCloseTo(10_000, 6);
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

    it('lists young accounts open whether or not they already paid, counts an account funded 70 days ago with two payouts as k = 2, and counts an ended young account', () => {
        const youngPaying = account(EVAL_PLAN, { purchasedOn: '2026-08-01' });
        const youngSilent = account(EVAL_PLAN, { purchasedOn: '2026-08-01' });
        const matured = account(EVAL_PLAN, { purchasedOn: '2026-06-01' });
        const youngEnded = account(EVAL_PLAN, { purchasedOn: '2026-08-01' });
        const result = fundedPayoutDistribution(
            ledger({
                accounts: [youngPaying, youngSilent, matured, youngEnded],
                events: [
                    purchased(youngPaying),
                    event(
                        youngPaying,
                        AccountEventKind.EvalPassed,
                        '2026-08-22',
                    ),
                    purchased(youngSilent),
                    event(
                        youngSilent,
                        AccountEventKind.EvalPassed,
                        '2026-08-22',
                    ),
                    purchased(matured),
                    event(matured, AccountEventKind.EvalPassed, '2026-06-23'),
                    purchased(youngEnded),
                    event(
                        youngEnded,
                        AccountEventKind.EvalPassed,
                        '2026-08-22',
                    ),
                    event(youngEnded, AccountEventKind.Busted, '2026-08-26'),
                ],
                payouts: [
                    payout(youngPaying, 40_000, {
                        netCents: 40_000,
                        paidOn: '2026-08-25',
                        status: PayoutStatus.Paid,
                    }),
                    payout(matured, 20_000, {
                        netCents: 20_000,
                        paidOn: '2026-07-10',
                        status: PayoutStatus.Paid,
                    }),
                    payout(matured, 30_000, {
                        netCents: 30_000,
                        paidOn: '2026-08-01',
                        status: PayoutStatus.Paid,
                    }),
                ],
            }),
            '2026-09-01',
            60,
        );
        const plan = result.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(plan?.openAccounts).toBe(2);
        expect(plan?.counts[0]).toBe(1);
        expect(plan?.counts[1]).toBe(0);
        expect(plan?.counts[2]).toBe(1);
        expect(plan?.realizedFundedValue?.n).toBe(2);
        expect(plan?.realizedFundedValue?.value).toBe(25_000);
    });

    it('gives the payout count distribution as probabilities summing to 1', () => {
        const owners = Array.from({ length: 4 }, () =>
            account(EVAL_PLAN, { purchasedOn: '2026-01-01' }),
        );
        const [zeroA, zeroB, one, two] = owners;
        if (
            zeroA === undefined ||
            zeroB === undefined ||
            one === undefined ||
            two === undefined
        ) {
            throw new Error('fixture owners missing');
        }
        const result = fundedPayoutDistribution(
            ledger({
                accounts: owners,
                events: owners.flatMap((owner) => [
                    purchased(owner),
                    event(owner, AccountEventKind.EvalPassed, '2026-01-05'),
                ]),
                payouts: [
                    payout(one, 10_000, {
                        netCents: 10_000,
                        paidOn: '2026-01-20',
                        status: PayoutStatus.Paid,
                    }),
                    payout(two, 10_000, {
                        netCents: 10_000,
                        paidOn: '2026-01-15',
                        status: PayoutStatus.Paid,
                    }),
                    payout(two, 10_000, {
                        netCents: 10_000,
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
        expect(plan?.probabilities).toHaveLength(PAYOUT_COUNT_CAP + 1);
        expect(plan?.probabilities.slice(0, 3)).toEqual([0.5, 0.25, 0.25]);
        expect(
            plan?.probabilities.reduce((sum, value) => sum + value, 0),
        ).toBeCloseTo(1, 12);
    });

    it('has no probabilities without an observed cohort', () => {
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
        expect(plan?.probabilities).toEqual([]);
    });
});

describe('PAYOUT_COUNT_CAP', () => {
    const source = fs.readFileSync(
        path.join(
            process.cwd(),
            'src/lib/prop-accounts/metrics/FundedPayoutDistribution.ts',
        ),
        'utf8',
    );

    it('is the simulator tail bucket, not a second literal', () => {
        expect(PAYOUT_COUNT_CAP).toBe(FUNDED_PAYOUT_COUNT_TAIL_BUCKET);
        expect(source).not.toMatch(/PAYOUT_COUNT_CAP\s*=\s*\d/);
        expect(source).toMatch(
            /PAYOUT_COUNT_CAP\s*=\s*FUNDED_PAYOUT_COUNT_TAIL_BUCKET/,
        );
    });
});
