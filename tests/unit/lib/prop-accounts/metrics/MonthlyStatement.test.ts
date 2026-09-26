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

function zeroFees(): Record<FeeKind, number> {
    return Object.fromEntries(
        Object.values(FeeKind).map((kind) => [kind, 0]),
    ) as Record<FeeKind, number>;
}

describe('monthlyStatement', () => {
    it('lists each month with cash, signed fees by kind, event counts and the running net', () => {
        const { rows } = build();
        const portfolio = ledger(rows);
        const { months } = monthlyStatement(portfolio);
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
        expect(monthlyStatement(ledger({})).months).toEqual([]);
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
