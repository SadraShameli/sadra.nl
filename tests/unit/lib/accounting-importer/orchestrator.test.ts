import { describe, expect, it } from 'vitest';

import type { RawTransaction } from '~/lib/accounting-importer/core/types';
import type { RateProvider } from '~/lib/accounting-importer/rates/provider';

import { buildBookings } from '~/lib/accounting-importer/core/orchestrator';

const fixedRates: RateProvider = {
    ensureRange: () => Promise.resolve(),
    rate({ base, quote }) {
        if (base === 'EUR' && quote === 'USD') return 1.1;
        throw new Error(`no rate ${base}/${quote}`);
    },
};

const tx = (overrides: Partial<RawTransaction>): RawTransaction => ({
    date: '2026-02-01',
    direction: 'OUT',
    merchant: 'Anthropic',
    sourceAmount: 100,
    sourceCurrency: 'EUR',
    sourceFee: 0,
    sourceFeeCurrency: null,
    sourceId: 'test',
    txnId: 't-1',
    ...overrides,
});

describe('buildBookings', () => {
    it('aggregates transactions sharing the same txnId', () => {
        const result = buildBookings({
            rates: fixedRates,
            start: '2026-01-01',
            transactions: [
                tx({ sourceAmount: 50, txnId: 't-1' }),
                tx({ sourceAmount: -10, txnId: 't-1' }),
            ],
        });
        expect(result.bookings).toHaveLength(1);
        expect(result.bookings[0]?.amountEur).toBe(40);
    });

    it('converts USD via ECB rate', () => {
        const result = buildBookings({
            rates: fixedRates,
            start: '2026-01-01',
            transactions: [
                tx({
                    sourceAmount: 110,
                    sourceCurrency: 'USD',
                    sourceFee: 0,
                    sourceFeeCurrency: 'USD',
                    txnId: 'usd-1',
                }),
            ],
        });
        expect(result.bookings[0]?.amountEur).toBe(100);
        expect(result.bookings[0]?.notes[0]).toMatch(/USD@ECB/);
    });

    it('routes outgoing merchants to OUT rules and incoming to PAYOUT rules', () => {
        const result = buildBookings({
            rates: fixedRates,
            start: '2026-01-01',
            transactions: [
                tx({
                    direction: 'IN',
                    merchant: 'apex',
                    sourceAmount: 200,
                    txnId: 'apex-in',
                }),
                tx({
                    merchant: 'apex',
                    sourceAmount: 50,
                    txnId: 'apex-out',
                }),
            ],
        });
        const inBooking = result.bookings.find((b) => b.txnId === 'apex-in');
        const outBooking = result.bookings.find((b) => b.txnId === 'apex-out');
        expect(inBooking?.vatCode).toBe('BU_EU_VERK');
        expect(outBooking?.vatCode).toBe('BU_EU_INK');
    });

    it('drops transactions before the start date', () => {
        const result = buildBookings({
            rates: fixedRates,
            start: '2026-01-01',
            transactions: [tx({ date: '2025-12-31', txnId: 'old' })],
        });
        expect(result.bookings).toHaveLength(0);
    });

    it('collects unknown merchants with first/last seen', () => {
        const result = buildBookings({
            rates: fixedRates,
            start: '2026-01-01',
            transactions: [
                tx({ date: '2026-02-01', merchant: 'NewVendor', txnId: 'u-1' }),
                tx({ date: '2026-03-01', merchant: 'NewVendor', txnId: 'u-2' }),
            ],
        });
        expect(result.bookings).toHaveLength(0);
        expect(result.unknowns).toHaveLength(1);
        expect(result.unknowns[0]).toMatchObject({
            count: 2,
            firstSeen: '2026-02-01',
            lastSeen: '2026-03-01',
            rawName: 'NewVendor',
        });
    });

    it('counts unsupported currencies separately', () => {
        const result = buildBookings({
            rates: fixedRates,
            start: '2026-01-01',
            transactions: [
                tx({
                    merchant: 'apex',
                    sourceAmount: 100,
                    sourceCurrency: 'GBP',
                    txnId: 'gbp-1',
                }),
            ],
        });
        expect(result.bookings).toHaveLength(0);
        expect(result.skippedCurrency).toBe(1);
    });
});
