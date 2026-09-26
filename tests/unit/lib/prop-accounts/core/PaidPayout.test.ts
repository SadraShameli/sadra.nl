import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    isPaidOnOrBefore,
    paidPayoutCash,
    type PayoutCashFields,
    PayoutStatus,
    usdCents,
} from '~/lib/prop-accounts/core';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');
const CASH_CONSUMERS = [
    'src/lib/prop-accounts/alerts/AlertContext.ts',
    'src/lib/prop-accounts/alerts/PayoutDollarMismatchRule.ts',
    'src/lib/prop-accounts/metrics/PortfolioLedger.ts',
    'src/lib/prop-accounts/metrics/SpendAndPayouts.ts',
    'src/lib/prop-accounts/metrics/MonthlyStatement.ts',
];

function payout(overrides: Partial<PayoutCashFields> = {}): PayoutCashFields {
    return {
        grossCents: usdCents(100_000),
        netCents: usdCents(90_000),
        paidOn: '2026-09-20',
        status: PayoutStatus.Paid,
        ...overrides,
    };
}

describe('paidPayoutCash', () => {
    it('takes the net amount of a Paid payout where given', () => {
        expect(paidPayoutCash(payout())).toEqual({
            cents: 90_000,
            grossOnly: false,
            paidOn: '2026-09-20',
        });
    });

    it('falls back to gross and flags it where net is missing', () => {
        expect(paidPayoutCash(payout({ netCents: null }))).toEqual({
            cents: 100_000,
            grossOnly: true,
            paidOn: '2026-09-20',
        });
    });

    it('counts a net of zero as net, not as a missing net', () => {
        const zeroNet = payout({ netCents: usdCents(0) });
        expect(paidPayoutCash(zeroNet)).toEqual({
            cents: 0,
            grossOnly: false,
            paidOn: '2026-09-20',
        });
    });

    it('is null for every status other than Paid', () => {
        for (const status of [
            PayoutStatus.Requested,
            PayoutStatus.Denied,
            PayoutStatus.Cancelled,
        ]) {
            expect(paidPayoutCash(payout({ status })), status).toBeNull();
        }
    });
});

describe('isPaidOnOrBefore', () => {
    it('dates a paid payout by its paid date only', () => {
        const paid = payout({ paidOn: '2026-09-20' });
        expect(isPaidOnOrBefore(paid, '2026-09-20')).toBe(true);
        expect(isPaidOnOrBefore(paid, '2026-09-21')).toBe(true);
        expect(isPaidOnOrBefore(paid, '2026-09-19')).toBe(false);
    });

    it('never counts a paid payout without a paid date, whatever its request date', () => {
        expect(isPaidOnOrBefore(payout({ paidOn: null }), '2100-12-31')).toBe(
            false,
        );
    });

    it('never counts a payout that is not Paid', () => {
        for (const status of [
            PayoutStatus.Requested,
            PayoutStatus.Denied,
            PayoutStatus.Cancelled,
        ]) {
            expect(
                isPaidOnOrBefore(payout({ status }), '2100-12-31'),
                status,
            ).toBe(false);
        }
    });
});

describe('one paid-payout rule', () => {
    it('leaves no hand-written net-or-gross or paid-date fallback in the consumers', () => {
        const copies = CASH_CONSUMERS.flatMap((file) => {
            const text = readFileSync(path.join(REPO_ROOT, file), 'utf8');
            return [
                /netCents \?\? [\w.]*grossCents/,
                /paidOn \?\? [\w.]*requestedOn\) <=/,
                /export function paidPayoutCash/,
            ]
                .filter((pattern) => pattern.test(text))
                .map((pattern) => `${file}: ${String(pattern)}`);
        });
        expect(copies).toEqual([]);
    });
});
