import { describe, expect, it } from 'vitest';

import {
    currencyCodeSchema,
    EUR_CODE,
    USD_CODE,
} from '~/lib/accounting/core/currency';
import {
    ConversionNote,
    CurrencyAmount,
    Eur,
} from '~/lib/accounting/core/money';

const GBP = currencyCodeSchema.parse('GBP');

describe('CurrencyAmount.format', () => {
    it('writes a transaction amount with its currency symbol, not a trailing code', () => {
        expect(CurrencyAmount.format({ amount: 175, currency: EUR_CODE })).toBe(
            '€175.00',
        );
        expect(
            CurrencyAmount.format({ amount: 1906.86, currency: USD_CODE }),
        ).toBe('$1,906.86');
        expect(CurrencyAmount.format({ amount: 12.5, currency: GBP })).toBe(
            '£12.50',
        );
    });

    it('writes euros exactly like the run totals do', () => {
        expect(
            CurrencyAmount.format({ amount: 490.79, currency: EUR_CODE }),
        ).toBe(Eur.format(490.79));
    });
});

describe('ConversionNote', () => {
    it('describes an ECB conversion as the source currency to EUR at the rate', () => {
        expect(ConversionNote.summarize(['USD@ECB1.1188'])).toEqual({
            descriptions: ['USD → EUR at 1.1188 (ECB)'],
            feeEur: 0,
        });
    });

    it('describes a euro transaction without the fee glued into the text', () => {
        expect(ConversionNote.summarize(['EUR+fee0.00'])).toEqual({
            descriptions: ['EUR, no conversion'],
            feeEur: 0,
        });
    });

    it('lists each distinct conversion once and adds the fees of every leg', () => {
        expect(
            ConversionNote.summarize([
                'EUR+fee0.25',
                'EUR+fee0.50',
                'USD@ECB1.1188',
                'USD@ECB1.1188',
            ]),
        ).toEqual({
            descriptions: ['EUR, no conversion', 'USD → EUR at 1.1188 (ECB)'],
            feeEur: 0.75,
        });
    });

    it('shows a note it does not recognise as it was stored', () => {
        expect(ConversionNote.summarize(['manual adjustment'])).toEqual({
            descriptions: ['manual adjustment'],
            feeEur: 0,
        });
    });

    it('writes the same note strings the bookings already carry', () => {
        expect(ConversionNote.ecb(USD_CODE, 1.11884).toString()).toBe(
            'USD@ECB1.1188',
        );
        expect(ConversionNote.eur(0.5).toString()).toBe('EUR+fee0.50');
        expect(ConversionNote.unsupported(GBP).toString()).toBe(
            'unsupported currency GBP',
        );
    });
});
