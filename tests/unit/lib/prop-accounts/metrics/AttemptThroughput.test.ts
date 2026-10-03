import { describe, expect, it } from 'vitest';

import {
    AccountEventKind,
    AccountStage,
    AccountTracking,
    FeeKind,
    firmKeyId,
    FirmKeyKind,
} from '~/lib/prop-accounts/core';
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

function sixMonthBook() {
    const early = account(EVAL_PLAN, { purchasedOn: '2026-01-05' });
    const mid = account(EVAL_PLAN, { purchasedOn: '2026-04-05' });
    const other = account(OTHER_FIRM_EVAL_PLAN, {
        purchasedOn: '2026-02-05',
    });
    const book = ledger({
        accounts: [early, mid, other],
        events: [
            purchased(early),
            event(early, AccountEventKind.Busted, '2026-01-09'),
            event(early, AccountEventKind.Reopened, '2026-01-12'),
            purchased(mid),
            event(mid, AccountEventKind.Busted, '2026-04-09'),
            event(mid, AccountEventKind.Reopened, '2026-04-12'),
            purchased(other),
        ],
    });
    return attemptThroughput(book, '2026-06-20');
}

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

    it('counts a ledger-only Purchased event in its month and in its firm row', () => {
        const external = account(EVAL_PLAN, {
            externalFirmId: '0b8c7f0e-6f3a-4f55-9a3e-8f4c1d2e3a4b',
            firmId: null,
            planLabel: 'Hola Prime 100K',
            planSerial: null,
            purchasedOn: '2026-06-03',
            stage: AccountStage.Funded,
            tracking: AccountTracking.LedgerOnly,
        });
        const result = attemptThroughput(
            ledger({
                accounts: [external],
                events: [purchased(external)],
            }),
            '2026-06-15',
        );
        expect(result.months).toEqual([{ attempts: 1, month: '2026-06' }]);
        const [row] = result.perFirm;
        expect(row?.firmKey.kind).toBe(FirmKeyKind.External);
        expect(row && firmKeyId(row.firmKey)).toBe(
            firmKeyId({
                externalFirmId: '0b8c7f0e-6f3a-4f55-9a3e-8f4c1d2e3a4b',
                kind: FirmKeyKind.External,
            }),
        );
        expect(row?.months).toEqual([{ attempts: 1, month: '2026-06' }]);
    });

    it('counts a ledger-only account with no events once, in its purchase month and in its firm row', () => {
        const externalFirmId = '0b8c7f0e-6f3a-4f55-9a3e-8f4c1d2e3a4b';
        const external = account(EVAL_PLAN, {
            externalFirmId,
            firmId: null,
            planLabel: 'Hola Prime 100K',
            planSerial: null,
            purchasedOn: '2026-06-03',
            stage: AccountStage.Funded,
            tracking: AccountTracking.LedgerOnly,
        });
        const result = attemptThroughput(
            ledger({ accounts: [external] }),
            '2026-06-15',
        );
        expect(result.months).toEqual([{ attempts: 1, month: '2026-06' }]);
        const [row] = result.perFirm;
        expect(row && firmKeyId(row.firmKey)).toBe(
            firmKeyId({ externalFirmId, kind: FirmKeyKind.External }),
        );
        expect(row?.months).toEqual([{ attempts: 1, month: '2026-06' }]);
        expect(row?.meanPerMonth).toBeCloseTo(1, 6);
    });

    it('counts a ledger-only account with a Purchased and a Reopened event once, as attemptsOf does', () => {
        const external = account(EVAL_PLAN, {
            externalFirmId: '0b8c7f0e-6f3a-4f55-9a3e-8f4c1d2e3a4b',
            firmId: null,
            planLabel: 'Hola Prime 100K',
            planSerial: null,
            purchasedOn: '2026-06-03',
            tracking: AccountTracking.LedgerOnly,
        });
        const result = attemptThroughput(
            ledger({
                accounts: [external],
                events: [
                    purchased(external),
                    event(external, AccountEventKind.Reopened, '2026-06-10'),
                ],
            }),
            '2026-06-15',
        );
        expect(result.months).toEqual([{ attempts: 1, month: '2026-06' }]);
    });
});

describe('attemptThroughput per-firm mean over the tracked window', () => {
    it('divides a firm attempts by every tracked month, not its own active months', () => {
        const result = sixMonthBook();
        expect(result.months).toHaveLength(6);
        const firmRow = result.perFirm.find(
            (row) =>
                firmKeyId(row.firmKey) ===
                firmKeyId({
                    firmId: EVAL_PLAN.firm.id,
                    kind: FirmKeyKind.Modeled,
                }),
        );
        expect(firmRow?.meanPerMonth).toBeCloseTo(4 / 6, 6);
        const otherRow = result.perFirm.find(
            (row) =>
                firmKeyId(row.firmKey) ===
                firmKeyId({
                    firmId: OTHER_FIRM_EVAL_PLAN.firm.id,
                    kind: FirmKeyKind.Modeled,
                }),
        );
        expect(otherRow?.meanPerMonth).toBeCloseTo(1 / 6, 6);
    });

    it('sums the per-firm series to the overall series and the firm means to the overall mean', () => {
        const result = sixMonthBook();
        for (const [index, month] of result.months.entries()) {
            const sum = result.perFirm.reduce(
                (total, firm) => total + (firm.months[index]?.attempts ?? 0),
                0,
            );
            expect(sum).toBe(month.attempts);
        }
        const meanSum = result.perFirm.reduce(
            (total, firm) => total + firm.meanPerMonth,
            0,
        );
        expect(meanSum).toBeCloseTo(result.meanPerMonth, 6);
    });

    it('gives a zero mean for a firm row when no month is tracked', () => {
        expect(attemptThroughput(ledger({}), '2026-06-15').perFirm).toEqual([]);
    });
});
