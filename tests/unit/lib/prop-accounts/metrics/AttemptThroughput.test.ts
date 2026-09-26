import { describe, expect, it } from 'vitest';

import { AccountEventKind, FeeKind } from '~/lib/prop-accounts/core';
import { attemptThroughput } from '~/lib/prop-accounts/metrics';

import {
    account,
    EVAL_PLAN,
    event,
    fee,
    ledger,
    OTHER_FIRM_EVAL_PLAN,
    purchased,
} from './ledgerFixtures';

describe('attemptThroughput', () => {
    it('counts purchases and reopens per month, filled, with the overall mean per month', () => {
        const a = account(EVAL_PLAN, { purchasedOn: '2026-06-01' });
        const result = attemptThroughput(
            ledger({
                accounts: [a],
                events: [
                    purchased(a),
                    event(a, AccountEventKind.Busted, '2026-06-05'),
                    event(a, AccountEventKind.Reopened, '2026-06-10'),
                    event(a, AccountEventKind.Busted, '2026-07-01'),
                    event(a, AccountEventKind.Reopened, '2026-08-01'),
                ],
            }),
            '2026-08-15',
        );
        expect(result.months.map((m) => [m.month, m.attempts])).toEqual([
            ['2026-06', 2],
            ['2026-07', 0],
            ['2026-08', 1],
        ]);
        expect(result.meanPerMonth).toBeCloseTo(1, 6);
    });

    it('gives attempts per firm per month and the mean over active firms', () => {
        const a = account(EVAL_PLAN, { purchasedOn: '2026-06-01' });
        const b = account(OTHER_FIRM_EVAL_PLAN, { purchasedOn: '2026-06-01' });
        const result = attemptThroughput(
            ledger({
                accounts: [a, b],
                events: [purchased(a), purchased(b)],
            }),
            '2026-06-15',
        );
        expect(result.perFirm).toHaveLength(2);
        for (const firm of result.perFirm) {
            expect(firm.months).toEqual([{ attempts: 1, month: '2026-06' }]);
        }
        expect(result.meanPerActiveFirmPerMonth).toBeCloseTo(1, 6);
    });

    it('counts a rebuy fee as an extra attempt, on a plan that retries by fee, dated separately from any lifecycle event', () => {
        expect(EVAL_PLAN.plan.fees.retry).toBe('rebuy');
        const a = account(EVAL_PLAN, { purchasedOn: '2026-06-01' });
        const withRebuyFee = ledger({
            accounts: [a],
            events: [purchased(a)],
            fees: [fee(a, FeeKind.Rebuy, 5000, '2026-06-20')],
        });
        const result = attemptThroughput(withRebuyFee, '2026-06-25');
        const june = result.months.find((m) => m.month === '2026-06');
        expect(june?.attempts).toBe(2);
    });

    it('does not double-count a rebuy fee dated the same day as its lifecycle event', () => {
        const a = account(EVAL_PLAN, { purchasedOn: '2026-06-01' });
        const withSameDayFee = ledger({
            accounts: [a],
            events: [
                purchased(a),
                event(a, AccountEventKind.Busted, '2026-06-05'),
                event(a, AccountEventKind.Reopened, '2026-06-10'),
            ],
            fees: [fee(a, FeeKind.Rebuy, 5000, '2026-06-10')],
        });
        const result = attemptThroughput(withSameDayFee, '2026-06-25');
        const june = result.months.find((m) => m.month === '2026-06');
        expect(june?.attempts).toBe(2);
    });

    it('is empty for an empty ledger', () => {
        const result = attemptThroughput(ledger({}), '2026-06-15');
        expect(result.months).toEqual([]);
        expect(result.perFirm).toEqual([]);
        expect(result.meanPerMonth).toBe(0);
        expect(result.meanPerActiveFirmPerMonth).toBeNull();
    });
});
