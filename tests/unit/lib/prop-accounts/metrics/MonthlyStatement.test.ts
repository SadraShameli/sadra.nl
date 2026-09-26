import { describe, expect, it } from 'vitest';

import {
    AccountEventKind,
    AccountStage,
    FeeKind,
    PayoutStatus,
} from '~/lib/prop-accounts/core';
import {
    ledgerTimeline,
    monthlyStatement,
    spendAndPayouts,
    TimelineEntryKind,
} from '~/lib/prop-accounts/metrics';

import {
    account,
    EVAL_PLAN,
    event,
    fee,
    ledger,
    OTHER_USER_ID,
    payout,
    purchased,
} from './ledgerFixtures';

function build() {
    const owner = account(EVAL_PLAN, {
        label: 'MFF one',
        purchasedOn: '2026-08-03',
        stage: AccountStage.Funded,
    });
    const rows = {
        accounts: [owner],
        events: [
            purchased(owner),
            event(owner, AccountEventKind.EvalPassed, '2026-09-16'),
            event(owner, AccountEventKind.Edited, '2026-11-02'),
            event(owner, AccountEventKind.Edited, '2026-11-03', {
                userId: OTHER_USER_ID,
            }),
        ],
        fees: [
            fee(owner, FeeKind.EvalPurchase, 16_700, '2026-08-03'),
            fee(owner, FeeKind.Activation, 13_000, '2026-09-16'),
            fee(owner, FeeKind.Refund, 2000, '2026-09-20'),
        ],
        payouts: [
            payout(owner, 100_000, {
                netCents: 90_000,
                paidOn: '2026-10-20',
                requestedOn: '2026-10-15',
            }),
            payout(owner, 50_000, {
                paidOn: null,
                requestedOn: '2026-10-28',
                status: PayoutStatus.Requested,
            }),
        ],
    };
    return { owner, rows };
}

const NO_TARGETS = { monthlyPayoutTargetCents: null, targetMonthlyMultiple: null };

function zeroFees(): Record<FeeKind, number> {
    return Object.fromEntries(
        Object.values(FeeKind).map((kind) => [kind, 0]),
    ) as Record<FeeKind, number>;
}

describe('monthlyStatement', () => {
    it('lists each month with cash, signed fees by kind, event counts and the running net', () => {
        const { rows } = build();
        const portfolio = ledger(rows);
        const { months } = monthlyStatement(portfolio, '2026-11-03', NO_TARGETS);
        expect(months.map((m) => [m.month, m.net, m.cumulativeNet])).toEqual([
            ['2026-08', -16_700, -16_700],
            ['2026-09', -11_000, -27_700],
            ['2026-10', 90_000, 62_300],
            ['2026-11', 0, 62_300],
        ]);
        expect(months[0]?.feesByKind).toEqual({
            ...zeroFees(),
            [FeeKind.EvalPurchase]: 16_700,
        });
        expect(months[1]?.feesByKind).toEqual({
            ...zeroFees(),
            [FeeKind.Activation]: 13_000,
            [FeeKind.Refund]: -2000,
        });
        expect(months[0]?.events).toEqual({ [AccountEventKind.Purchased]: 1 });
        expect(months[1]?.events).toEqual({ [AccountEventKind.EvalPassed]: 1 });
        expect(months[2]?.events).toEqual({});
        expect(months[3]?.events).toEqual({ [AccountEventKind.Edited]: 1 });
        expect(months[3]).toMatchObject({
            paidPayouts: 0,
            payouts: 0,
            spend: 0,
        });
        const cash = spendAndPayouts(portfolio).byMonth;
        for (const month of cash) {
            expect(months.find((m) => m.month === month.month)).toMatchObject(
                month,
            );
        }
    });

    it('is empty for an empty ledger', () => {
        expect(
            monthlyStatement(ledger({}), '2026-09-28', NO_TARGETS).months,
        ).toEqual([]);
    });
});

describe('monthlyStatement fills and disclosures', () => {
    it('fills every month from the first purchase to the as-of month, even with no cash, and marks the current month partial', () => {
        const owner = account(EVAL_PLAN, { purchasedOn: '2026-06-01' });
        const { months } = monthlyStatement(
            ledger({
                accounts: [owner],
                fees: [fee(owner, FeeKind.EvalPurchase, 10_000, '2026-06-01')],
            }),
            '2026-08-15',
            NO_TARGETS,
        );
        expect(months.map((month) => month.month)).toEqual([
            '2026-06',
            '2026-07',
            '2026-08',
        ]);
        expect(months.map((month) => month.isPartial)).toEqual([
            false,
            false,
            true,
        ]);
    });

    it('gives the payout multiple, a trailing three-month multiple and month-over-month payout growth, null with no prior month', () => {
        const owner = account(EVAL_PLAN, { purchasedOn: '2026-06-01' });
        const { months } = monthlyStatement(
            ledger({
                accounts: [owner],
                fees: [
                    fee(owner, FeeKind.EvalPurchase, 10_000, '2026-06-01'),
                    fee(owner, FeeKind.EvalPurchase, 10_000, '2026-07-01'),
                ],
                payouts: [
                    payout(owner, 20_000, {
                        netCents: 20_000,
                        paidOn: '2026-06-15',
                    }),
                    payout(owner, 40_000, {
                        netCents: 40_000,
                        paidOn: '2026-07-15',
                    }),
                ],
            }),
            '2026-07-20',
            NO_TARGETS,
        );
        expect(months[0]?.multiple).toBeCloseTo(2, 6);
        expect(months[0]?.payoutGrowth).toBeNull();
        expect(months[1]?.multiple).toBeCloseTo(4, 6);
        expect(months[1]?.payoutGrowth).toBeCloseTo(1, 6);
        expect(months[1]?.trailingThreeMonthMultiple).toBeCloseTo(3, 6);
    });

    it('flags months at or above the review targets, and leaves the flag null without a target', () => {
        const owner = account(EVAL_PLAN, { purchasedOn: '2026-06-01' });
        const { months } = monthlyStatement(
            ledger({
                accounts: [owner],
                payouts: [
                    payout(owner, 100_000, {
                        netCents: 100_000,
                        paidOn: '2026-06-15',
                    }),
                ],
            }),
            '2026-06-20',
            NO_TARGETS,
        );
        expect(months[0]?.meetsPayoutTarget).toBeNull();
        expect(months[0]?.meetsMultipleTarget).toBeNull();
        const withTargets = monthlyStatement(
            ledger({
                accounts: [owner],
                payouts: [
                    payout(owner, 100_000, {
                        netCents: 100_000,
                        paidOn: '2026-06-15',
                    }),
                ],
            }),
            '2026-06-20',
            { monthlyPayoutTargetCents: 100_000, targetMonthlyMultiple: 5 },
        ).months;
        expect(withTargets[0]?.meetsPayoutTarget).toBe(true);
        expect(withTargets[0]?.meetsMultipleTarget).toBe(true);
    });

    it('treats a payout with no recorded spend as trivially meeting the multiple target, not missing it', () => {
        const owner = account(EVAL_PLAN, { purchasedOn: '2026-06-01' });
        const { months } = monthlyStatement(
            ledger({
                accounts: [owner],
                payouts: [
                    payout(owner, 100_000, {
                        netCents: 100_000,
                        paidOn: '2026-06-15',
                    }),
                ],
            }),
            '2026-06-20',
            { monthlyPayoutTargetCents: null, targetMonthlyMultiple: 5 },
        );
        expect(months[0]?.multiple).toBeNull();
        expect(months[0]?.meetsMultipleTarget).toBe(true);
    });

    it('does not meet the multiple target when there is neither spend nor a payout', () => {
        const owner = account(EVAL_PLAN, { purchasedOn: '2026-06-01' });
        const { months } = monthlyStatement(
            ledger({ accounts: [owner] }),
            '2026-06-20',
            { monthlyPayoutTargetCents: null, targetMonthlyMultiple: 5 },
        );
        expect(months[0]?.multiple).toBeNull();
        expect(months[0]?.meetsMultipleTarget).toBe(false);
    });
});

describe('ledgerTimeline', () => {
    it('lists events, fees and payouts in date order, payouts on their paid date or else their request date', () => {
        const { owner, rows } = build();
        const timeline = ledgerTimeline(ledger(rows));
        expect(
            timeline.map((entry) => {
                switch (entry.kind) {
                    case TimelineEntryKind.Event: {
                        return [entry.on, entry.kind, entry.eventKind];
                    }
                    case TimelineEntryKind.Fee: {
                        return [
                            entry.on,
                            entry.kind,
                            entry.feeKind,
                            entry.signedCents,
                        ];
                    }
                    case TimelineEntryKind.Payout: {
                        return [
                            entry.on,
                            entry.kind,
                            entry.status,
                            entry.netCents,
                        ];
                    }
                }
            }),
        ).toEqual([
            ['2026-08-03', TimelineEntryKind.Event, AccountEventKind.Purchased],
            ['2026-08-03', TimelineEntryKind.Fee, FeeKind.EvalPurchase, 16_700],
            [
                '2026-09-16',
                TimelineEntryKind.Event,
                AccountEventKind.EvalPassed,
            ],
            ['2026-09-16', TimelineEntryKind.Fee, FeeKind.Activation, 13_000],
            ['2026-09-20', TimelineEntryKind.Fee, FeeKind.Refund, -2000],
            ['2026-10-20', TimelineEntryKind.Payout, PayoutStatus.Paid, 90_000],
            [
                '2026-10-28',
                TimelineEntryKind.Payout,
                PayoutStatus.Requested,
                null,
            ],
            ['2026-11-02', TimelineEntryKind.Event, AccountEventKind.Edited],
        ]);
        expect(timeline.every((entry) => entry.accountId === owner.id)).toBe(
            true,
        );
        expect(
            timeline.every((entry) => entry.accountLabel === 'MFF one'),
        ).toBe(true);
    });
});
