import { describe, expect, it } from 'vitest';

import {
    AccountEventKind,
    AccountStage,
    AccountStatus,
    FeeKind,
} from '~/lib/prop-accounts/core';
import { realizedNetPerSlot } from '~/lib/prop-accounts/metrics';

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

describe('realizedNetPerSlot', () => {
    it('divides a month of net cash by the active funded account-months', () => {
        const owner = account(INSTANT_PLAN);
        const result = realizedNetPerSlot(
            ledger({
                accounts: [owner],
                events: [purchased(owner)],
                fees: [fee(owner, FeeKind.EvalPurchase, 10_000, '2026-09-01')],
                payouts: [
                    payout(owner, 55_000, {
                        netCents: 50_000,
                        paidOn: '2026-09-20',
                    }),
                ],
            }),
            '2026-09-30',
        );
        expect(result.months).toEqual([
            {
                month: '2026-09',
                net: 40_000,
                netPerSlot: 40_000,
                payouts: 50_000,
                payoutsPerSlot: 50_000,
                slotMonths: 1,
            },
        ]);
        expect(result.pooled).toEqual({ standardError: null, value: 40_000 });
        expect(result.slotMonths).toBe(1);
        expect(result.n).toBe(1);
        expect(result.unallocatedMonths).toBe(0);
        expect(result.unallocatedNet).toBe(0);
    });

    it('pools net over slot-months with a ratio-estimator SE and sets eval-only months apart as unallocated', () => {
        const owner = account(EVAL_PLAN, {
            purchasedOn: '2026-08-03',
            stage: AccountStage.Funded,
        });
        const result = realizedNetPerSlot(
            ledger({
                accounts: [owner],
                events: [
                    purchased(owner),
                    event(owner, AccountEventKind.EvalPassed, '2026-09-16'),
                ],
                fees: [
                    fee(owner, FeeKind.EvalPurchase, 16_700, '2026-08-03'),
                    fee(owner, FeeKind.Activation, 13_000, '2026-09-16'),
                ],
                payouts: [
                    payout(owner, 100_000, {
                        netCents: 90_000,
                        paidOn: '2026-10-20',
                    }),
                ],
            }),
            '2026-10-31',
        );
        expect(result.months).toEqual([
            {
                month: '2026-09',
                net: -13_000,
                netPerSlot: -26_000,
                payouts: 0,
                payoutsPerSlot: 0,
                slotMonths: 0.5,
            },
            {
                month: '2026-10',
                net: 90_000,
                netPerSlot: 90_000,
                payouts: 90_000,
                payoutsPerSlot: 90_000,
                slotMonths: 1,
            },
        ]);
        expect(result.n).toBe(2);
        expect(result.pooled).toEqual({ standardError: 51_556, value: 51_333 });
        expect(result.slotMonths).toBe(1.5);
        expect(result.unallocatedMonths).toBe(1);
        expect(result.unallocatedNet).toBe(-16_700);
    });

    it('stops exposure on the bust date and pauses it while suspended', () => {
        const busted = account(INSTANT_PLAN, { status: AccountStatus.Busted });
        const paused = account(INSTANT_PLAN);
        const bustResult = realizedNetPerSlot(
            ledger({
                accounts: [busted],
                events: [
                    purchased(busted),
                    event(busted, AccountEventKind.Busted, '2026-09-16'),
                ],
                fees: [fee(busted, FeeKind.EvalPurchase, 10_000, '2026-09-01')],
            }),
            '2026-09-30',
        );
        expect(bustResult.months).toEqual([
            {
                month: '2026-09',
                net: -10_000,
                netPerSlot: -20_000,
                payouts: 0,
                payoutsPerSlot: 0,
                slotMonths: 0.5,
            },
        ]);
        const pauseResult = realizedNetPerSlot(
            ledger({
                accounts: [paused],
                events: [
                    purchased(paused),
                    event(paused, AccountEventKind.Suspended, '2026-09-11'),
                    event(paused, AccountEventKind.Resumed, '2026-09-21'),
                ],
                fees: [fee(paused, FeeKind.EvalPurchase, 3000, '2026-09-01')],
            }),
            '2026-09-30',
        );
        expect(pauseResult.months[0]?.slotMonths).toBeCloseTo(20 / 30, 12);
        expect(pauseResult.months[0]?.netPerSlot).toBe(-4500);
    });

    it('adds overlapping accounts, keeps a live account in its slot and ignores exposure after the as-of date', () => {
        const funded = account(INSTANT_PLAN, { purchasedOn: '2026-09-16' });
        const live = account(EVAL_PLAN, { stage: AccountStage.Live });
        const result = realizedNetPerSlot(
            ledger({
                accounts: [funded, live],
                events: [
                    purchased(funded),
                    purchased(live),
                    event(live, AccountEventKind.EvalPassed, '2026-09-01'),
                    event(live, AccountEventKind.MovedLive, '2026-09-10'),
                ],
                payouts: [
                    payout(live, 45_000, {
                        netCents: 45_000,
                        paidOn: '2026-09-25',
                    }),
                ],
            }),
            '2026-09-30',
        );
        expect(result.months).toEqual([
            {
                month: '2026-09',
                net: 45_000,
                netPerSlot: 30_000,
                payouts: 45_000,
                payoutsPerSlot: 30_000,
                slotMonths: 1.5,
            },
        ]);
    });

    it('splits exposure across month and year boundaries', () => {
        const owner = account(INSTANT_PLAN, { purchasedOn: '2026-11-15' });
        const result = realizedNetPerSlot(
            ledger({
                accounts: [owner],
                events: [purchased(owner)],
                fees: [fee(owner, FeeKind.EvalPurchase, 9300, '2027-01-05')],
            }),
            '2027-01-10',
        );
        expect(
            result.months.map((month) => [month.month, month.slotMonths]),
        ).toEqual([
            ['2026-11', 16 / 30],
            ['2026-12', 1],
            ['2027-01', 10 / 31],
        ]);
        expect(result.months.map((month) => month.net)).toEqual([0, 0, -9300]);
        expect(result.months[2]?.netPerSlot).toBe(-28_830);
    });

    it('keeps a short first funded month from dominating the pooled figure', () => {
        const owner = account(EVAL_PLAN, {
            purchasedOn: '2026-10-05',
            stage: AccountStage.Funded,
        });
        const result = realizedNetPerSlot(
            ledger({
                accounts: [owner],
                events: [
                    purchased(owner),
                    event(owner, AccountEventKind.EvalPassed, '2026-10-31'),
                ],
                fees: [
                    fee(owner, FeeKind.EvalPurchase, 15_000, '2026-10-05'),
                    fee(owner, FeeKind.Reset, 15_000, '2026-10-12'),
                    fee(owner, FeeKind.Reset, 15_000, '2026-10-19'),
                ],
                payouts: [
                    payout(owner, 90_000, {
                        netCents: 90_000,
                        paidOn: '2026-11-20',
                    }),
                ],
            }),
            '2026-11-30',
        );
        expect(result.months.map((month) => month.netPerSlot)).toEqual([
            -1_395_000, 90_000,
        ]);
        expect(result.pooled).toEqual({ standardError: 89_912, value: 43_594 });
        expect(result.n).toBe(2);
    });

    it('rounds each month to whole cents', () => {
        const owner = account(INSTANT_PLAN, { purchasedOn: '2026-09-02' });
        const result = realizedNetPerSlot(
            ledger({
                accounts: [owner],
                events: [purchased(owner)],
                payouts: [
                    payout(owner, 10_000, {
                        netCents: 10_000,
                        paidOn: '2026-09-20',
                    }),
                ],
            }),
            '2026-09-30',
        );
        expect(result.months[0]?.netPerSlot).toBe(10_345);
        expect(Number.isSafeInteger(result.pooled?.value)).toBe(true);
    });

    it('counts no fee or payout dated after the as-of date, like the exposure', () => {
        const owner = account(INSTANT_PLAN);
        const result = realizedNetPerSlot(
            ledger({
                accounts: [owner],
                events: [purchased(owner)],
                fees: [
                    fee(owner, FeeKind.EvalPurchase, 10_000, '2026-09-01'),
                    fee(owner, FeeKind.Other, 7000, '2026-10-02'),
                ],
                payouts: [
                    payout(owner, 55_000, {
                        netCents: 50_000,
                        paidOn: '2026-09-20',
                    }),
                    payout(owner, 30_000, {
                        netCents: 30_000,
                        paidOn: '2026-10-05',
                    }),
                ],
            }),
            '2026-09-30',
        );
        expect(result.months).toEqual([
            {
                month: '2026-09',
                net: 40_000,
                netPerSlot: 40_000,
                payouts: 50_000,
                payoutsPerSlot: 50_000,
                slotMonths: 1,
            },
        ]);
        expect(result.unallocatedMonths).toBe(0);
        expect(result.unallocatedNet).toBe(0);
    });

    it('opens no slot from a pass with an unknown date and keeps that account out of the pooled figure, counted and with its net shown apart', () => {
        const measured = account(INSTANT_PLAN);
        const undated = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const undatedLive = account(EVAL_PLAN, { stage: AccountStage.Live });
        const result = realizedNetPerSlot(
            ledger({
                accounts: [measured, undated, undatedLive],
                events: [
                    purchased(measured),
                    purchased(undatedLive),
                    event(
                        undatedLive,
                        AccountEventKind.MovedLive,
                        '2026-09-16',
                    ),
                ],
                fees: [
                    fee(measured, FeeKind.EvalPurchase, 10_000, '2026-09-01'),
                    fee(undated, FeeKind.EvalPurchase, 16_700, '2026-09-01'),
                    fee(
                        undatedLive,
                        FeeKind.EvalPurchase,
                        16_700,
                        '2026-09-01',
                    ),
                ],
                payouts: [
                    payout(measured, 50_000, {
                        netCents: 50_000,
                        paidOn: '2026-09-20',
                    }),
                    payout(undated, 200_000, {
                        netCents: 180_000,
                        paidOn: '2026-09-20',
                    }),
                    payout(undatedLive, 100_000, {
                        netCents: 90_000,
                        paidOn: '2026-09-25',
                    }),
                ],
            }),
            '2026-09-30',
        );
        expect(result.months).toEqual([
            {
                month: '2026-09',
                net: 40_000,
                netPerSlot: 40_000,
                payouts: 50_000,
                payoutsPerSlot: 50_000,
                slotMonths: 1,
            },
        ]);
        expect(result.pooled).toEqual({ standardError: null, value: 40_000 });
        expect(result.slotMonths).toBe(1);
        expect(result.unmeasuredFundedAccounts).toBe(2);
        expect(result.unmeasuredNet).toBe(236_600);
        expect(result.unallocatedNet).toBe(0);
    });

    it('measures an account whose pass date is known, with nothing unmeasured', () => {
        const owner = account(EVAL_PLAN, {
            fundedOn: '2026-09-16',
            stage: AccountStage.Funded,
        });
        const result = realizedNetPerSlot(
            ledger({ accounts: [owner], events: [purchased(owner)] }),
            '2026-09-30',
        );
        expect(result.slotMonths).toBe(0.5);
        expect(result.unmeasuredFundedAccounts).toBe(0);
        expect(result.unmeasuredNet).toBe(0);
    });

    it('leaves out accounts whose plan does not resolve and counts them', () => {
        const lost = account(INSTANT_PLAN, { planSerial: 'retired-plan' });
        const result = realizedNetPerSlot(
            ledger({
                accounts: [lost],
                events: [purchased(lost)],
                payouts: [payout(lost, 10_000, { paidOn: '2026-09-20' })],
            }),
            '2026-09-30',
        );
        expect(result.months).toEqual([]);
        expect(result.pooled).toBeNull();
        expect(result.n).toBe(0);
        expect(result.unallocatedNet).toBe(0);
        expect(result.unresolvedAccounts).toBe(1);
    });
});
