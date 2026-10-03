import { describe, expect, it } from 'vitest';

import {
    AccountEventKind,
    AccountStage,
    FeeKind,
} from '~/lib/prop-accounts/core';
import {
    monthlyStatement,
    realizedNetPerSlot,
    repeatability,
} from '~/lib/prop-accounts/metrics';
import { wilsonInterval } from '~/lib/prop-calculator/stats';

import {
    account,
    EVAL_PLAN,
    event,
    fee,
    INSTANT_PLAN,
    ledger,
    payout,
    purchased,
} from './ledgerFixtures';

const NO_TARGETS = {
    monthlyPayoutTargetCents: null,
    targetMonthlyMultiple: null,
};

const FIRST_MONTH_NUMBER = 6;

function monthlyNetLedger(nets: readonly number[]) {
    const owner = account(EVAL_PLAN, { purchasedOn: '2026-06-01' });
    return ledger({
        accounts: [owner],
        fees: nets.flatMap((net, index) =>
            net < 0
                ? [fee(owner, FeeKind.Other, 0 - net, `${monthOf(index)}-05`)]
                : [],
        ),
        payouts: nets.flatMap((net, index) =>
            net > 0
                ? [
                      payout(owner, net, {
                          netCents: net,
                          paidOn: `${monthOf(index)}-15`,
                      }),
                  ]
                : [],
        ),
    });
}

function monthOf(index: number): string {
    return `2026-${String(FIRST_MONTH_NUMBER + index).padStart(2, '0')}`;
}

function repeatabilityOf(
    portfolio: ReturnType<typeof ledger>,
    asOf: string,
    target: null | number,
) {
    const targets = {
        monthlyPayoutTargetCents: target,
        targetMonthlyMultiple: null,
    };
    const statement = monthlyStatement(portfolio, asOf, targets);
    const slots = realizedNetPerSlot(portfolio, asOf);
    return {
        result: repeatability(statement, slots, target),
        slots,
        statement,
    };
}

function threeMonthLedger() {
    const owner = account(EVAL_PLAN, { purchasedOn: '2026-06-01' });
    return ledger({
        accounts: [owner],
        fees: [fee(owner, FeeKind.EvalPurchase, 10_000, '2026-06-01')],
        payouts: [
            payout(owner, 30_000, { netCents: 30_000, paidOn: '2026-06-15' }),
            payout(owner, 10_000, { netCents: 10_000, paidOn: '2026-07-15' }),
            payout(owner, 20_000, { netCents: 20_000, paidOn: '2026-08-15' }),
        ],
    });
}

function twoSlotJuneLedger() {
    const alpha = account(EVAL_PLAN, {
        fundedOn: '2026-06-01',
        purchasedOn: '2026-05-01',
        stage: AccountStage.Funded,
    });
    const bravo = account(EVAL_PLAN, {
        fundedOn: '2026-06-01',
        purchasedOn: '2026-05-01',
        stage: AccountStage.Funded,
    });
    return ledger({
        accounts: [alpha, bravo],
        events: [
            purchased(alpha),
            event(alpha, AccountEventKind.EvalPassed, '2026-06-01'),
            purchased(bravo),
            event(bravo, AccountEventKind.EvalPassed, '2026-06-01'),
        ],
        payouts: [
            payout(alpha, 24_000, { netCents: 24_000, paidOn: '2026-06-15' }),
        ],
    });
}

describe('repeatability', () => {
    it('gives count, mean, sample SD, worst, best and share positive over complete months', () => {
        const portfolio = threeMonthLedger();
        const statement = monthlyStatement(portfolio, '2026-09-01', NO_TARGETS);
        const slots = realizedNetPerSlot(portfolio, '2026-09-01');
        const result = repeatability(statement, slots, null);
        expect(result.overall).toMatchObject({
            best: 30_000 - 10_000,
            count: 3,
            mean: Math.round((20_000 + 10_000 + 20_000) / 3),
            worst: 10_000,
        });
        expect(result.overall?.sharePositive).toMatchObject({
            n: 3,
            value: 1,
        });
        expect(result.overall?.shareAtOrAboveTarget).toBeNull();
    });

    it('gives the share at or above a target, once one is set', () => {
        const portfolio = threeMonthLedger();
        const statement = monthlyStatement(portfolio, '2026-09-01', NO_TARGETS);
        const slots = realizedNetPerSlot(portfolio, '2026-09-01');
        const result = repeatability(statement, slots, 15_000);
        expect(result.overall?.shareAtOrAboveTarget?.value).toBeCloseTo(
            2 / 3,
            6,
        );
    });

    it('counts a slot month at target when its measured payouts reach the portfolio target', () => {
        const portfolio = twoSlotJuneLedger();
        const statement = monthlyStatement(portfolio, '2026-07-01', NO_TARGETS);
        const slots = realizedNetPerSlot(portfolio, '2026-07-01');
        const result = repeatability(statement, slots, 20_000);
        expect(result.perSlot).toMatchObject({ mean: 12_000 });
        expect(result.perSlot?.shareAtOrAboveTarget?.value).toBe(1);
    });

    it('is null without any complete month', () => {
        const empty = ledger({});
        const statement = monthlyStatement(empty, '2026-09-01', NO_TARGETS);
        const slots = realizedNetPerSlot(empty, '2026-09-01');
        const result = repeatability(statement, slots, null);
        expect(result.overall).toBeNull();
        expect(result.perSlot).toBeNull();
    });

    it('counts a month with payouts above the target and a negative net as a hit, the way the statement does', () => {
        const owner = account(EVAL_PLAN, { purchasedOn: '2026-06-01' });
        const portfolio = ledger({
            accounts: [owner],
            fees: [fee(owner, FeeKind.Other, 14_000, '2026-06-05')],
            payouts: [
                payout(owner, 12_000, {
                    netCents: 12_000,
                    paidOn: '2026-06-15',
                }),
            ],
        });
        const { result, statement } = repeatabilityOf(
            portfolio,
            '2026-07-01',
            10_000,
        );
        const [june] = statement.months;
        expect(june).toMatchObject({ net: -2000, payouts: 12_000 });
        expect(june?.meetsPayoutTarget).toBe(true);
        expect(result.overall?.shareAtOrAboveTarget?.value).toBe(1);
        expect(result.overall?.sharePositive.value).toBe(0);
        expect(result.overall?.mean).toBe(-2000);
    });

    it('counts a slot month at target by its measured payouts, whose per-slot figure is the target over that month slots', () => {
        const alpha = account(EVAL_PLAN, {
            fundedOn: '2026-06-01',
            purchasedOn: '2026-05-01',
            stage: AccountStage.Funded,
        });
        const bravo = account(EVAL_PLAN, {
            fundedOn: '2026-06-01',
            purchasedOn: '2026-05-01',
            stage: AccountStage.Funded,
        });
        const portfolio = ledger({
            accounts: [alpha, bravo],
            events: [
                purchased(alpha),
                event(alpha, AccountEventKind.EvalPassed, '2026-06-01'),
                purchased(bravo),
                event(bravo, AccountEventKind.EvalPassed, '2026-06-01'),
            ],
            fees: [fee(alpha, FeeKind.Other, 14_000, '2026-06-05')],
            payouts: [
                payout(alpha, 12_000, {
                    netCents: 12_000,
                    paidOn: '2026-06-15',
                }),
            ],
        });
        const { result, slots } = repeatabilityOf(
            portfolio,
            '2026-07-01',
            10_000,
        );
        expect(slots.months[0]).toMatchObject({
            net: -2000,
            netPerSlot: -1000,
            payouts: 12_000,
            payoutsPerSlot: 6000,
        });
        expect(result.perSlot?.shareAtOrAboveTarget?.value).toBe(1);
        expect(result.perSlot?.mean).toBe(-1000);
    });

    it('measures the per-slot share on measured accounts only, so an unmeasured account payout lifts the statement and not the slot month', () => {
        const measured = account(INSTANT_PLAN, { purchasedOn: '2026-06-01' });
        const unmeasured = account(EVAL_PLAN, {
            purchasedOn: '2026-06-01',
            stage: AccountStage.Funded,
        });
        const portfolio = ledger({
            accounts: [measured, unmeasured],
            events: [purchased(measured), purchased(unmeasured)],
            payouts: [
                payout(measured, 6000, {
                    netCents: 6000,
                    paidOn: '2026-06-15',
                }),
                payout(unmeasured, 6000, {
                    netCents: 6000,
                    paidOn: '2026-06-16',
                }),
            ],
        });
        const { result, slots, statement } = repeatabilityOf(
            portfolio,
            '2026-07-01',
            10_000,
        );
        expect(slots.unmeasuredFundedAccounts).toBe(1);
        expect(statement.months[0]).toMatchObject({
            meetsPayoutTarget: true,
            payouts: 12_000,
        });
        expect(slots.months[0]).toMatchObject({ payouts: 6000 });
        expect(result.overall?.shareAtOrAboveTarget?.value).toBe(1);
        expect(result.perSlot?.shareAtOrAboveTarget?.value).toBe(0);
    });

    it('gives the n - 1 sample deviation of the monthly net', () => {
        const { result } = repeatabilityOf(
            monthlyNetLedger([100, 200, 300]),
            '2026-09-01',
            null,
        );
        expect(result.overall?.standardDeviation).toBe(100);
    });

    it('gives a zero deviation below two complete months', () => {
        const { result } = repeatabilityOf(
            monthlyNetLedger([500]),
            '2026-07-01',
            null,
        );
        expect(result.overall).toMatchObject({
            count: 1,
            standardDeviation: 0,
        });
    });

    it('drops the as-of month from the per-slot series, as the statement marks it partial', () => {
        const owner = account(EVAL_PLAN, {
            fundedOn: '2026-06-01',
            purchasedOn: '2026-05-01',
            stage: AccountStage.Funded,
        });
        const portfolio = ledger({
            accounts: [owner],
            events: [
                purchased(owner),
                event(owner, AccountEventKind.EvalPassed, '2026-06-01'),
            ],
            payouts: [
                payout(owner, 24_000, {
                    netCents: 24_000,
                    paidOn: '2026-06-15',
                }),
            ],
        });
        const { result, slots } = repeatabilityOf(
            portfolio,
            '2026-07-15',
            null,
        );
        expect(slots.months.map((month) => month.month)).toEqual([
            '2026-06',
            '2026-07',
        ]);
        expect(result.perSlot?.count).toBe(1);
        expect(result.perSlot?.best).toBe(24_000);
    });

    it('gives the shares as sampled rates with their Wilson interval', () => {
        const { result } = repeatabilityOf(
            monthlyNetLedger([100, 100, 100, 100, -50, -50]),
            '2026-12-01',
            null,
        );
        expect(result.overall?.sharePositive).toMatchObject({
            interval: wilsonInterval(4, 6),
            n: 6,
        });
        expect(result.overall?.sharePositive.value).toBeCloseTo(2 / 3, 12);
    });

    it('pins the interval ends at 0 of 3 and 3 of 3', () => {
        const none = repeatabilityOf(
            monthlyNetLedger([-10, -20, -30]),
            '2026-09-01',
            null,
        ).result.overall?.sharePositive;
        const all = repeatabilityOf(
            monthlyNetLedger([10, 20, 30]),
            '2026-09-01',
            null,
        ).result.overall?.sharePositive;
        expect(none).toMatchObject({ n: 3, value: 0 });
        expect(none?.interval?.lower).toBe(0);
        expect(none?.interval).toEqual(wilsonInterval(0, 3));
        expect(all).toMatchObject({ n: 3, value: 1 });
        expect(all?.interval?.upper).toBe(1);
        expect(all?.interval).toEqual(wilsonInterval(3, 3));
    });

    it('gives the target share as a sampled rate over the months counted', () => {
        const { result } = repeatabilityOf(
            monthlyNetLedger([100, 200, 300]),
            '2026-09-01',
            150,
        );
        expect(result.overall?.shareAtOrAboveTarget).toMatchObject({
            interval: wilsonInterval(2, 3),
            n: 3,
        });
    });

    it('counts payouts exactly at the target as a hit even when the per-slot share is not a whole number of cents', () => {
        const slotOwners = [0, 1, 2].map(() =>
            account(EVAL_PLAN, {
                fundedOn: '2026-06-01',
                purchasedOn: '2026-05-01',
                stage: AccountStage.Funded,
            }),
        );
        const [first] = slotOwners;
        if (first === undefined) throw new Error('missing account');
        const portfolio = ledger({
            accounts: slotOwners,
            events: slotOwners.flatMap((owner) => [
                purchased(owner),
                event(owner, AccountEventKind.EvalPassed, '2026-06-01'),
            ]),
            payouts: [
                payout(first, 10_000, {
                    netCents: 10_000,
                    paidOn: '2026-06-15',
                }),
            ],
        });
        const { result, statement } = repeatabilityOf(
            portfolio,
            '2026-07-01',
            10_000,
        );
        expect(statement.months[1]?.meetsPayoutTarget).toBe(true);
        expect(result.perSlot?.shareAtOrAboveTarget?.value).toBe(1);
    });
});
