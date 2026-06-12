import { describe, expect, it, vi } from 'vitest';

import type { RateProvider } from '~/lib/accounting/rates/provider';

import { convertToEur } from '~/lib/accounting/core/money';
import { EcbRateProvider } from '~/lib/accounting/rates/ecb';

const TX_BASE = {
    date: '2026-03-01',
    direction: 'OUT' as const,
    merchant: 'Test',
    sourceAmount: 100,
    sourceFee: 0,
    sourceFeeCurrency: null,
    sourceId: 'src',
    txnId: 't1',
};

describe('convertToEur – multi-currency', () => {
    it('converts GBP via rate provider', () => {
        const rates: RateProvider = {
            ensureRange: () => Promise.resolve(),
            rate({ base, quote }) {
                if (base === 'EUR' && quote === 'GBP') return 0.85;
                throw new Error(`no rate ${base}/${quote}`);
            },
        };
        const result = convertToEur(
            { ...TX_BASE, sourceCurrency: 'GBP' },
            rates,
        );
        expect(result.eur).toBeCloseTo(100 / 0.85, 2);
        expect(result.note).toMatch(/GBP@ECB/);
    });

    it('includes same-currency fee for GBP', () => {
        const rates: RateProvider = {
            ensureRange: () => Promise.resolve(),
            rate() {
                return 0.85;
            },
        };
        const result = convertToEur(
            {
                ...TX_BASE,
                sourceCurrency: 'GBP',
                sourceFee: 1,
                sourceFeeCurrency: 'GBP',
            },
            rates,
        );
        expect(result.eur).toBeCloseTo(101 / 0.85, 2);
    });

    it('falls through to skippedCurrency for an ECB-unsupported currency', () => {
        const rates: RateProvider = {
            ensureRange: () => Promise.resolve(),
            rate({ base, quote }) {
                throw new Error(`ECB does not publish ${base}/${quote}`);
            },
        };
        const result = convertToEur(
            { ...TX_BASE, sourceCurrency: 'XYZ' },
            rates,
        );
        expect(result.eur).toBeNull();
        expect(result.note).toMatch(/unsupported currency XYZ/);
    });

    it('USD conversion note still uses USD@ECB format', () => {
        const rates: RateProvider = {
            ensureRange: () => Promise.resolve(),
            rate({ base, quote }) {
                if (base === 'EUR' && quote === 'USD') return 1.1;
                throw new Error(`no rate ${base}/${quote}`);
            },
        };
        const result = convertToEur(
            { ...TX_BASE, sourceAmount: 110, sourceCurrency: 'USD' },
            rates,
        );
        expect(result.eur).toBeCloseTo(100, 2);
        expect(result.note).toMatch(/USD@ECB/);
    });
});

const GBP_CSV = `KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE
"EXR.D.GBP.EUR.SP00.A","D","GBP","EUR","SP00","A","2026-03-01","0.8500"
"EXR.D.GBP.EUR.SP00.A","D","GBP","EUR","SP00","A","2026-03-03","0.8600"
`;

describe('EcbRateProvider – multi-currency', () => {
    it('fetches and returns GBP rate for a specific date', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(GBP_CSV),
        });

        const provider = new EcbRateProvider({
            fetchImpl: mockFetch as unknown as typeof fetch,
        });

        await provider.ensureCurrencyRange('GBP', {
            end: '2026-03-31',
            start: '2026-03-01',
        });

        expect(
            provider.rate({ base: 'EUR', on: '2026-03-01', quote: 'GBP' }),
        ).toBe(0.85);
        expect(
            provider.rate({ base: 'EUR', on: '2026-03-03', quote: 'GBP' }),
        ).toBe(0.86);
    });

    it('falls back to nearest earlier date for GBP', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(GBP_CSV),
        });

        const provider = new EcbRateProvider({
            fetchImpl: mockFetch as unknown as typeof fetch,
        });

        await provider.ensureCurrencyRange('GBP', {
            end: '2026-03-31',
            start: '2026-03-01',
        });

        expect(
            provider.rate({ base: 'EUR', on: '2026-03-02', quote: 'GBP' }),
        ).toBe(0.85);
    });

    it('does not re-fetch when range is already cached', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(GBP_CSV),
        });

        const provider = new EcbRateProvider({
            fetchImpl: mockFetch as unknown as typeof fetch,
        });

        const range = { end: '2026-03-31', start: '2026-03-01' };
        await provider.ensureCurrencyRange('GBP', range);
        await provider.ensureCurrencyRange('GBP', range);

        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('throws for an unknown currency that was never loaded', async () => {
        const provider = new EcbRateProvider();
        expect(() =>
            provider.rate({ base: 'EUR', on: '2026-03-01', quote: 'XYZ' }),
        ).toThrow(/No ECB rates loaded for currency XYZ/);
    });

    it('ensureRange continues to fetch USD only (backward compat)', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(GBP_CSV),
        });

        const provider = new EcbRateProvider({
            fetchImpl: mockFetch as unknown as typeof fetch,
        });

        await provider.ensureRange({ end: '2026-03-31', start: '2026-03-01' });

        const [url] = mockFetch.mock.calls[0] as [URL];
        expect(url.toString()).toMatch(/D\.USD\.EUR/);
    });
});
