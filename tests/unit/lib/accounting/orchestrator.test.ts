import { describe, expect, it } from 'vitest';

import type {
    BookingRule,
    LedgerRef,
    RawTransaction,
} from '~/lib/accounting/core/types';
import type { RateProvider } from '~/lib/accounting/rates/provider';

import { buildBookings } from '~/lib/accounting/core/orchestrator';

const fixedRates: RateProvider = {
    ensureRange: () => Promise.resolve(),
    rate({ base, quote }) {
        if (base === 'EUR' && quote === 'USD') return 1.1;
        throw new Error(`no rate ${base}/${quote}`);
    },
};

const WISE_EUR: LedgerRef = { id: 5, label: '0005 Wise EUR' };
const WISE_USD: LedgerRef = { id: 6, label: '0006 Wise USD' };
const SOFTWARE: LedgerRef = { id: 2, label: '0002 Trading Software' };
const FUNDED: LedgerRef = { id: 1, label: '0001 Funded accounts' };
const PAYOUTS: LedgerRef = { id: 4, label: '0004 Payouts' };

const RULES: BookingRule[] = [
    {
        direction: 'OUT',
        display: 'Anthropic',
        id: 'r1',
        ledger: SOFTWARE,
        match: 'anthropic',
        vatCode: 'BI_EU_INK',
    },
    {
        direction: 'OUT',
        display: 'Apex (cost)',
        id: 'r2',
        ledger: FUNDED,
        match: 'apex',
        vatCode: 'BU_EU_INK',
    },
    {
        direction: 'IN',
        display: 'Apex payout',
        id: 'r3',
        ledger: PAYOUTS,
        match: 'apex',
        vatCode: 'BU_EU_VERK',
    },
];

const bankByCurrency = new Map<string, LedgerRef>([
    ['EUR', WISE_EUR],
    ['USD', WISE_USD],
]);

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

const build = (transactions: RawTransaction[], banks = bankByCurrency) =>
    buildBookings({
        bankByCurrency: banks,
        rates: fixedRates,
        rules: RULES,
        start: '2026-01-01',
        transactions,
    });

describe('buildBookings', () => {
    it('resolves the matched rule ledger and currency bank', () => {
        const result = build([tx({ txnId: 't-1' })]);
        expect(result.bookings).toHaveLength(1);
        expect(result.bookings[0]?.counterpartLedger).toEqual(SOFTWARE);
        expect(result.bookings[0]?.bank).toEqual(WISE_EUR);
    });

    it('aggregates transactions sharing the same txnId', () => {
        const result = build([
            tx({ sourceAmount: 50, txnId: 't-1' }),
            tx({ sourceAmount: -10, txnId: 't-1' }),
        ]);
        expect(result.bookings).toHaveLength(1);
        expect(result.bookings[0]?.amountEur).toBe(40);
    });

    it('converts USD via ECB rate and uses the USD bank', () => {
        const result = build([
            tx({
                sourceAmount: 110,
                sourceCurrency: 'USD',
                sourceFeeCurrency: 'USD',
                txnId: 'usd-1',
            }),
        ]);
        expect(result.bookings[0]?.amountEur).toBe(100);
        expect(result.bookings[0]?.bank).toEqual(WISE_USD);
        expect(result.bookings[0]?.notes[0]).toMatch(/USD@ECB/);
    });

    it('routes outgoing merchants to OUT rules and incoming to IN rules', () => {
        const result = build([
            tx({
                direction: 'IN',
                merchant: 'apex',
                sourceAmount: 200,
                txnId: 'apex-in',
            }),
            tx({ merchant: 'apex', sourceAmount: 50, txnId: 'apex-out' }),
        ]);
        const inBooking = result.bookings.find((b) => b.txnId === 'apex-in');
        const outBooking = result.bookings.find((b) => b.txnId === 'apex-out');
        expect(inBooking?.counterpartLedger).toEqual(PAYOUTS);
        expect(outBooking?.counterpartLedger).toEqual(FUNDED);
    });

    it('flags a card refund and routes it to the purchase ledger and VAT', () => {
        const result = build([
            tx({
                direction: 'IN',
                isRefund: true,
                merchant: 'ApexFutures',
                sourceAmount: 29.9,
                sourceCurrency: 'USD',
                txnId: 'card-3845452810',
            }),
        ]);
        expect(result.bookings).toHaveLength(1);
        const booking = result.bookings[0];
        expect(booking?.isRefund).toBe(true);
        expect(booking?.direction).toBe('IN');
        expect(booking?.counterpartLedger).toEqual(FUNDED);
        expect(booking?.vatCode).toBe('BU_EU_INK');
        expect(booking?.bank).toEqual(WISE_USD);
    });

    it('drops transactions before the start date', () => {
        const result = build([tx({ date: '2025-12-31', txnId: 'old' })]);
        expect(result.bookings).toHaveLength(0);
    });

    it('collects unknown merchants with first/last seen', () => {
        const result = build([
            tx({ date: '2026-02-01', merchant: 'NewVendor', txnId: 'u-1' }),
            tx({ date: '2026-03-01', merchant: 'NewVendor', txnId: 'u-2' }),
        ]);
        expect(result.bookings).toHaveLength(0);
        expect(result.unknowns).toHaveLength(1);
        expect(result.unknowns[0]).toMatchObject({
            count: 2,
            firstSeen: '2026-02-01',
            lastSeen: '2026-03-01',
            rawName: 'NewVendor',
        });
    });

    it('skips matched transactions whose currency has no bank account', () => {
        const result = build([
            tx({ merchant: 'apex', sourceCurrency: 'GBP', txnId: 'gbp-1' }),
        ]);
        expect(result.bookings).toHaveLength(0);
        expect(result.skippedNoBank).toBe(1);
        expect(result.missingBankCurrencies).toEqual(['GBP']);
    });

    it('counts unsupported FX currencies separately from missing banks', () => {
        const banks = new Map<string, LedgerRef>([
            ...bankByCurrency,
            ['GBP', { id: 9, label: 'GBP bank' }],
        ]);
        const result = build(
            [tx({ merchant: 'apex', sourceCurrency: 'GBP', txnId: 'gbp-2' })],
            banks,
        );
        expect(result.bookings).toHaveLength(0);
        expect(result.skippedCurrency).toBe(1);
        expect(result.skippedNoBank).toBe(0);
    });
});
