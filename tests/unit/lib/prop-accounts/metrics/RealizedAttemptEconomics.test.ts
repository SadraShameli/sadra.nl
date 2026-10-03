import { describe, expect, it } from 'vitest';

import {
    AccountEventKind,
    AccountStatus,
    FeeKind,
    PayoutStatus,
} from '~/lib/prop-accounts/core';
import {
    costAnalytics,
    fundedPayoutDistribution,
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
            plan.decomposition.value.fundedValueToAttemptCost.value?.netToOne,
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

    it('lists a young funded account that already paid within the horizon as open, not as an observed attempt (was attempts 1 and averagePayout 100,000 under the any-payout rule)', () => {
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
        expect(plan?.attempts).toBe(0);
        expect(plan?.averagePayout).toBeNull();
        expect(plan?.fundedValue).toBeNull();
        expect(plan?.realizedEvPerAttempt).toBeNull();
    });

    it('counts a funded account once it is H days old, and a young one that ended', () => {
        const old = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const youngEnded = account(EVAL_PLAN, { purchasedOn: '2026-08-20' });
        const result = realizedAttemptEconomics(
            ledger({
                accounts: [old, youngEnded],
                events: [
                    purchased(old),
                    event(old, AccountEventKind.EvalPassed, '2026-07-01'),
                    purchased(youngEnded),
                    event(
                        youngEnded,
                        AccountEventKind.EvalPassed,
                        '2026-08-25',
                    ),
                    event(youngEnded, AccountEventKind.Busted, '2026-08-27'),
                ],
            }),
            '2026-09-01',
            60,
        );
        const plan = result.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(plan?.attempts).toBe(2);
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
        expect(plan?.payoutsPerPaidFundedEstimate?.value).toBe(1);
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

    it('shows the same attempt cost as the cost analytics for a plan whose accounts all ended, a funded reset fee in the fixture and an open attempt fee left out of both', () => {
        const fundedThenBusted = account(EVAL_PLAN, {
            purchasedOn: '2026-01-01',
        });
        const bustedEval = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const openEval = account(EVAL_PLAN, { purchasedOn: '2026-08-20' });
        const book = ledger({
            accounts: [fundedThenBusted, bustedEval, openEval],
            events: [
                purchased(fundedThenBusted),
                event(
                    fundedThenBusted,
                    AccountEventKind.EvalPassed,
                    '2026-01-05',
                ),
                event(fundedThenBusted, AccountEventKind.Busted, '2026-02-01'),
                purchased(bustedEval),
                event(bustedEval, AccountEventKind.Busted, '2026-01-10'),
                purchased(openEval),
            ],
            fees: [
                fee(
                    fundedThenBusted,
                    FeeKind.EvalPurchase,
                    10_000,
                    '2026-01-01',
                ),
                fee(fundedThenBusted, FeeKind.FundedReset, 4000, '2026-01-20'),
                fee(bustedEval, FeeKind.EvalPurchase, 10_000, '2026-01-01'),
                fee(openEval, FeeKind.EvalPurchase, 9000, '2026-08-20'),
            ],
        });
        const realized = realizedAttemptEconomics(book, '2026-09-01', 30);
        const costs = costAnalytics(book, new Map());
        const realizedPlan = realized.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        const costPlan = costs.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(realizedPlan?.attemptCost).toBe(12_000);
        expect(costPlan?.costPerAttempt).toBe(realizedPlan?.attemptCost);
    });

    it('keeps one attempt cost per plan even with a young funded account the cohort leaves open', () => {
        const ended = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const young = account(EVAL_PLAN, { purchasedOn: '2026-08-20' });
        const book = ledger({
            accounts: [ended, young],
            events: [
                purchased(ended),
                event(ended, AccountEventKind.Busted, '2026-01-10'),
                purchased(young),
                event(young, AccountEventKind.EvalPassed, '2026-08-25'),
            ],
            fees: [
                fee(ended, FeeKind.EvalPurchase, 10_000, '2026-01-01'),
                fee(young, FeeKind.EvalPurchase, 16_000, '2026-08-20'),
            ],
        });
        const realized = realizedAttemptEconomics(book, '2026-09-01', 30);
        const costs = costAnalytics(book, new Map());
        const realizedPlan = realized.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        const costPlan = costs.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(realizedPlan?.attemptCost).toBe(13_000);
        expect(costPlan?.costPerAttempt).toBe(13_000);
    });

    it('scopes attempts and realized EV per attempt to the horizon cohort while the attempt cost covers every account, a young paying funded account left out of the first two', () => {
        const ended = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const young = account(EVAL_PLAN, { purchasedOn: '2026-08-20' });
        const book = ledger({
            accounts: [ended, young],
            events: [
                purchased(ended),
                event(ended, AccountEventKind.Busted, '2026-01-10'),
                purchased(young),
                event(young, AccountEventKind.EvalPassed, '2026-08-25'),
            ],
            fees: [
                fee(ended, FeeKind.EvalPurchase, 10_000, '2026-01-01'),
                fee(young, FeeKind.EvalPurchase, 16_000, '2026-08-20'),
            ],
            payouts: [
                payout(young, 50_000, {
                    netCents: 50_000,
                    paidOn: '2026-08-28',
                    status: PayoutStatus.Paid,
                }),
            ],
        });
        const realized = realizedAttemptEconomics(book, '2026-09-01', 30);
        const costs = costAnalytics(book, new Map());
        const plan = realized.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        const costPlan = costs.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(costPlan?.attempts).toBe(2);
        expect(plan?.attemptCost).toBe(13_000);
        expect(plan?.attempts).toBe(1);
        expect(plan?.realizedEvPerAttempt).toBe(-10_000);
    });

    it('builds the decomposition from the one realized funded value of the payout distribution, every factor carrying its n', () => {
        const first = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const second = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const third = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const book = ledger({
            accounts: [first, second, third],
            events: [
                purchased(first),
                event(first, AccountEventKind.EvalPassed, '2026-01-05'),
                purchased(second),
                event(second, AccountEventKind.EvalPassed, '2026-01-05'),
                purchased(third),
                event(third, AccountEventKind.EvalPassed, '2026-01-05'),
            ],
            fees: [
                fee(first, FeeKind.EvalPurchase, 10_000, '2026-01-01'),
                fee(second, FeeKind.EvalPurchase, 10_000, '2026-01-01'),
                fee(third, FeeKind.EvalPurchase, 10_000, '2026-01-01'),
            ],
            payouts: [
                payout(first, 90_000, {
                    netCents: 90_000,
                    paidOn: '2026-01-20',
                    status: PayoutStatus.Paid,
                }),
                payout(second, 30_000, {
                    netCents: 30_000,
                    paidOn: '2026-01-20',
                    status: PayoutStatus.Paid,
                }),
            ],
        });
        const result = realizedAttemptEconomics(book, '2026-09-01', 30);
        const distribution = fundedPayoutDistribution(book, '2026-09-01', 30);
        const plan = result.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        const distributed = distribution.perPlan.find(
            (p) => p.planSerial === EVAL_PLAN.serial,
        );
        expect(distributed?.realizedFundedValue?.value).toBe(40_000);
        expect(plan?.fundedValue).toEqual(distributed?.realizedFundedValue);
        expect(plan?.decomposition?.value?.fundedValue).toBeCloseTo(400, 9);
        expect(
            plan?.decomposition?.value?.breakevenPassRate.value,
        ).toBeCloseTo(100 / 400, 9);
        expect(plan?.fundedValue?.n).toBe(3);
        expect(plan?.passRate?.n).toBe(3);
        expect(plan?.payoutRate?.n).toBeGreaterThan(0);
        expect(plan?.payoutsPerPaidFundedEstimate?.n).toBe(2);
        expect(plan?.averagePayout?.n).toBe(2);
    });
});
