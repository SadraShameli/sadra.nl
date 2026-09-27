import { describe, expect, it } from 'vitest';

import {
    AccountEventKind,
    AccountStatus,
    FeeKind,
    PayoutStatus,
} from '~/lib/prop-accounts/core';
import {
    MARGIN_ABOVE_BREAKEVEN_HELP_TEXT,
    perAttemptNetCents,
    realizedAttemptEconomics,
} from '~/lib/prop-accounts/metrics';
import { wilsonInterval } from '~/lib/prop-calculator/stats';

import {
    account,
    EVAL_PLAN,
    event,
    fee,
    ledger,
    payout,
    purchased,
} from './ledgerFixtures';

describe('perAttemptNetCents', () => {
    it('gives one net-cash sample per ended attempt, excluding open and too-young accounts', () => {
        const busted = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const stillEval = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const youngFunded = account(EVAL_PLAN, { purchasedOn: '2026-08-20' });
        const values = perAttemptNetCents(
            ledger({
                accounts: [busted, stillEval, youngFunded],
                events: [
                    purchased(busted),
                    event(busted, AccountEventKind.Busted, '2026-01-10'),
                    purchased(stillEval),
                    purchased(youngFunded),
                    event(
                        youngFunded,
                        AccountEventKind.EvalPassed,
                        '2026-08-25',
                    ),
                ],
            }),
            '2026-09-01',
            30,
        );
        expect(values).toHaveLength(1);
    });

    it('splits an account net cash evenly over its attempts', () => {
        const owner = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const values = perAttemptNetCents(
            ledger({
                accounts: [owner],
                events: [
                    purchased(owner),
                    event(owner, AccountEventKind.Busted, '2026-01-10'),
                ],
                payouts: [],
            }),
            '2026-09-01',
            30,
        );
        expect(values).toHaveLength(1);
        expect(values[0]).toBe(0);
    });
});

describe('realizedAttemptEconomics', () => {
    it('gives realized EV per attempt as pooled net cash divided by pooled attempts', () => {
        const failed = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const funded = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const result = realizedAttemptEconomics(
            ledger({
                accounts: [failed, funded],
                events: [
                    purchased(failed),
                    event(failed, AccountEventKind.Busted, '2026-01-10'),
                    purchased(funded),
                    event(funded, AccountEventKind.EvalPassed, '2026-01-05'),
                ],
                payouts: [
                    payout(funded, 100_000, {
                        netCents: 100_000,
                        paidOn: '2026-01-20',
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
        expect(plan?.attempts).toBe(2);
        expect(plan?.realizedEvPerAttempt).toBe(50_000);
    });

    it('gives the attempt cost as net fees over attempts, over the ended cohort', () => {
        const first = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const second = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const result = realizedAttemptEconomics(
            ledger({
                accounts: [first, second],
                events: [
                    purchased(first),
                    event(first, AccountEventKind.Busted, '2026-01-10'),
                    purchased(second),
                    event(second, AccountEventKind.Busted, '2026-01-10'),
                ],
                fees: [
                    fee(first, FeeKind.EvalPurchase, 10_000, '2026-01-01'),
                    fee(second, FeeKind.EvalPurchase, 10_000, '2026-01-01'),
                ],
            }),
            '2026-09-01',
            30,
        );
        const plan = result.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(plan?.attemptCost).toBe(10_000);
    });

    it('matches the video fixture: $100 attempt cost, $1,000 funded value gives 10% breakeven and net 9:1', () => {
        const owner = account(EVAL_PLAN, {
            purchasedOn: '2026-01-01',
            status: AccountStatus.Active,
        });
        const result = realizedAttemptEconomics(
            ledger({
                accounts: [owner],
                events: [
                    purchased(owner),
                    event(owner, AccountEventKind.EvalPassed, '2026-01-05'),
                ],
                fees: [fee(owner, FeeKind.EvalPurchase, 10_000, '2026-01-01')],
                payouts: [
                    payout(owner, 100_000, {
                        netCents: 100_000,
                        paidOn: '2026-01-20',
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
        expect(plan?.attemptCost).toBe(10_000);
        expect(plan?.decomposition?.value).not.toBeNull();
        if (plan?.decomposition?.value == null) return;
        expect(plan.decomposition.value.breakevenPassRate.value).toBeCloseTo(
            0.1,
            6,
        );
        expect(
            plan.decomposition.value.fundedValueToAttemptCost.value
                ?.netToOne,
        ).toBeCloseTo(9, 6);
    });

    it('is above breakeven only when the pass-rate interval clears it', () => {
        const owner = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const result = realizedAttemptEconomics(
            ledger({
                accounts: [owner],
                events: [
                    purchased(owner),
                    event(owner, AccountEventKind.EvalPassed, '2026-01-05'),
                ],
                payouts: [
                    payout(owner, 100_000, {
                        netCents: 100_000,
                        paidOn: '2026-01-20',
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
        expect(plan?.passRate).not.toBeNull();
        const interval = wilsonInterval(1, 1);
        const breakeven =
            plan?.decomposition?.value?.breakevenPassRate.value ?? null;
        expect(plan?.marginAboveBreakeven).toBe(
            breakeven !== null &&
                interval !== null &&
                interval.lower > breakeven,
        );
    });

    it('counts a young funded account that already paid within the horizon, without waiting for the full horizon to elapse', () => {
        const owner = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const result = realizedAttemptEconomics(
            ledger({
                accounts: [owner],
                events: [
                    purchased(owner),
                    event(owner, AccountEventKind.EvalPassed, '2026-01-05'),
                ],
                payouts: [
                    payout(owner, 100_000, {
                        netCents: 100_000,
                        paidOn: '2026-01-10',
                        status: PayoutStatus.Paid,
                    }),
                ],
            }),
            '2026-01-15',
            30,
        );
        const plan = result.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(plan?.attempts).toBe(1);
        expect(plan?.averagePayout?.value).toBe(100_000);
    });

    it('scopes payoutsPerPaidFunded to the same horizon window as averagePayout', () => {
        const owner = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const result = realizedAttemptEconomics(
            ledger({
                accounts: [owner],
                events: [
                    purchased(owner),
                    event(owner, AccountEventKind.EvalPassed, '2026-01-05'),
                ],
                payouts: [
                    payout(owner, 100_000, {
                        netCents: 100_000,
                        paidOn: '2026-01-10',
                        status: PayoutStatus.Paid,
                    }),
                    payout(owner, 200_000, {
                        netCents: 200_000,
                        paidOn: '2026-03-01',
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
        expect(plan?.payoutsPerPaidFunded).toBe(1);
        expect(plan?.averagePayout?.value).toBe(100_000);
    });

    it('states that only the pass-rate interval gates the breakeven margin (Q50)', () => {
        expect(MARGIN_ABOVE_BREAKEVEN_HELP_TEXT).toMatch(
            /pass-rate interval alone/,
        );
        expect(MARGIN_ABOVE_BREAKEVEN_HELP_TEXT).toMatch(/not applied/);
    });

    it('leaves the decomposition and margin null without enough data', () => {
        const stillEval = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const result = realizedAttemptEconomics(
            ledger({
                accounts: [stillEval],
                events: [purchased(stillEval)],
            }),
            '2026-09-01',
            30,
        );
        const plan = result.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(plan?.decomposition).toBeNull();
        expect(plan?.marginAboveBreakeven).toBeNull();
        expect(plan?.attempts).toBe(0);
        expect(plan?.realizedEvPerAttempt).toBeNull();
    });
});
