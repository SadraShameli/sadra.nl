import { describe, expect, it } from 'vitest';

import { payoutTimingCardOf } from '~/app/(app)/prop-calculator/accounts/_components/overview/payoutTimingModel';
import {
    AccountEventKind,
    AccountStatus,
    PayoutStatus,
    SampleLevel,
} from '~/lib/prop-accounts/core';
import { payoutTiming } from '~/lib/prop-accounts/metrics';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';

import {
    account,
    EVAL_PLAN,
    event,
    ledger,
    OTHER_FIRM_EVAL_PLAN,
    payout,
    purchased,
} from '../../../lib/prop-accounts/metrics/ledgerFixtures';

const TODAY = '2026-06-01';

const PLAN_NAMES = {
    of: (planSerial: string) =>
        ({
            [EVAL_PLAN.serial]: 'Plan A',
            [OTHER_FIRM_EVAL_PLAN.serial]: 'Plan B',
        })[planSerial] ?? planSerial,
};

const UNSET_THRESHOLDS = DEFAULT_RULEBOOK.samples;
const SET_THRESHOLDS = { ...DEFAULT_RULEBOOK.samples, minFundedAccounts: 3 };

function cardOf(
    rows: Parameters<typeof ledger>[0],
    thresholds = UNSET_THRESHOLDS,
) {
    return payoutTimingCardOf(
        payoutTiming(ledger(rows), TODAY),
        PLAN_NAMES,
        thresholds,
    );
}

function fundedOn(plan: typeof EVAL_PLAN, passedOn: string) {
    const owner = account(plan, { purchasedOn: '2026-01-01' });
    return {
        events: [
            purchased(owner),
            event(owner, AccountEventKind.EvalPassed, passedOn),
        ],
        owner,
    };
}

function paid(owner: ReturnType<typeof account>, paidOn: string) {
    return payout(owner, 40_000, { paidOn, status: PayoutStatus.Paid });
}

function twoPaidAccountsRows() {
    const first = fundedOn(EVAL_PLAN, '2026-01-01');
    const second = fundedOn(EVAL_PLAN, '2026-01-01');
    return {
        accounts: [first.owner, second.owner],
        events: [...first.events, ...second.events],
        payouts: [
            paid(first.owner, '2026-01-21'),
            paid(first.owner, '2026-02-04'),
            paid(second.owner, '2026-01-31'),
        ],
    };
}

describe('payoutTimingCardOf', () => {
    it('gives one row per plan with the mean days to the first payout and between later payouts, each with n', () => {
        const card = cardOf(twoPaidAccountsRows());
        expect(card.rows).toHaveLength(1);
        const row = card.rows[0];
        expect(row?.plan).toBe('Plan A');
        expect(row?.toFirstPayout.mean).toBe('25.0 days');
        expect(row?.toFirstPayout.n).toBe(2);
        expect(row?.toFirstPayout.standardError).toBe('5.0 days');
        expect(row?.betweenPayouts.mean).toBe('14.0 days');
        expect(row?.betweenPayouts.n).toBe(1);
        expect(row?.betweenPayouts.standardError).toBe('n/a');
    });

    it('shows n/a with n = 0 for a plan with no payout', () => {
        const idle = fundedOn(EVAL_PLAN, '2026-05-02');
        const card = cardOf({
            accounts: [idle.owner],
            events: idle.events,
        });
        const row = card.rows[0];
        expect(row?.toFirstPayout).toMatchObject({
            mean: 'n/a',
            n: 0,
            standardError: 'n/a',
        });
        expect(row?.betweenPayouts).toMatchObject({
            mean: 'n/a',
            n: 0,
            standardError: 'n/a',
        });
    });

    it('carries the funded-accounts sample level, none at n = 0 and null when the threshold is unset', () => {
        const rows = twoPaidAccountsRows();
        const withThreshold = cardOf(rows, SET_THRESHOLDS).rows[0];
        expect(withThreshold?.toFirstPayout.sampleLevel).toBe(SampleLevel.Low);
        expect(withThreshold?.betweenPayouts.sampleLevel).toBe(SampleLevel.Low);
        const noPayout = fundedOn(OTHER_FIRM_EVAL_PLAN, '2026-05-02');
        const empty = cardOf(
            { accounts: [noPayout.owner], events: noPayout.events },
            SET_THRESHOLDS,
        ).rows[0];
        expect(empty?.toFirstPayout.sampleLevel).toBe(SampleLevel.None);
        const unset = cardOf(rows).rows[0];
        expect(unset?.toFirstPayout.sampleLevel).toBeNull();
    });

    it('says how many funded accounts have not paid yet, with the oldest wait, and that they are not in the mean', () => {
        const rows = twoPaidAccountsRows();
        const waiting = fundedOn(EVAL_PLAN, '2026-03-03');
        const card = cardOf({
            accounts: [...rows.accounts, waiting.owner],
            events: [...rows.events, ...waiting.events],
            payouts: rows.payouts,
        });
        expect(card.rows[0]?.unpaidNote).toBe(
            '1 funded account has not paid yet (oldest 90 days), not in the mean',
        );
    });

    it('pluralises the unpaid sentence and names a one day wait in the singular', () => {
        const older = fundedOn(EVAL_PLAN, '2026-05-01');
        const newer = fundedOn(EVAL_PLAN, '2026-05-31');
        const card = cardOf({
            accounts: [older.owner, newer.owner],
            events: [...older.events, ...newer.events],
        });
        expect(card.rows[0]?.unpaidNote).toBe(
            '2 funded accounts have not paid yet (oldest 31 days), not in the mean',
        );
        const single = fundedOn(EVAL_PLAN, '2026-05-31');
        const one = cardOf({
            accounts: [single.owner],
            events: single.events,
        });
        expect(one.rows[0]?.unpaidNote).toBe(
            '1 funded account has not paid yet (oldest 1 day), not in the mean',
        );
    });

    it('says an ended account that never paid ended without a payout, not that it has not paid yet', () => {
        const busted = account(EVAL_PLAN, {
            purchasedOn: '2026-01-01',
            status: AccountStatus.Busted,
        });
        const bustedOnly = cardOf({
            accounts: [busted],
            events: [
                purchased(busted),
                event(busted, AccountEventKind.EvalPassed, '2026-01-05'),
            ],
        });
        expect(bustedOnly.rows[0]?.unpaidNote).toBe(
            '1 funded account ended without a payout, not in the mean',
        );
        const waiting = fundedOn(EVAL_PLAN, '2026-03-03');
        const closed = account(EVAL_PLAN, {
            purchasedOn: '2026-01-01',
            status: AccountStatus.Closed,
        });
        const both = cardOf({
            accounts: [waiting.owner, busted, closed],
            events: [
                ...waiting.events,
                purchased(busted),
                event(busted, AccountEventKind.EvalPassed, '2026-01-05'),
                purchased(closed),
                event(closed, AccountEventKind.EvalPassed, '2026-01-06'),
            ],
        });
        expect(both.rows[0]?.unpaidNote).toBe(
            '1 funded account has not paid yet (oldest 90 days), not in the mean. 2 funded accounts ended without a payout, not in the mean',
        );
    });

    it('has no unpaid sentence when every funded account has paid', () => {
        expect(cardOf(twoPaidAccountsRows()).rows[0]?.unpaidNote).toBeNull();
    });

    it('is an empty card for a ledger with no plan', () => {
        expect(cardOf({}).rows).toEqual([]);
    });

    it('explains the two columns in one line without an em dash', () => {
        const { explanation } = cardOf(twoPaidAccountsRows());
        expect(explanation).toContain('first payout');
        expect(explanation).toContain('later payouts');
        expect(explanation).not.toContain('—');
        expect(explanation).not.toContain('\n');
    });

    it('orders rows by plan name', () => {
        const b = fundedOn(OTHER_FIRM_EVAL_PLAN, '2026-05-02');
        const a = fundedOn(EVAL_PLAN, '2026-05-02');
        const card = cardOf({
            accounts: [b.owner, a.owner],
            events: [...b.events, ...a.events],
        });
        expect(card.rows.map((row) => row.plan)).toEqual(['Plan A', 'Plan B']);
    });
});
