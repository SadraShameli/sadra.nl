import type {
    CurrencyCode,
    DateRange,
    ISODate,
} from '~/lib/accounting/core/types';

export interface RateProvider {
    ensureRange(range: DateRange): Promise<void>;
    rate(options: {
        base: CurrencyCode;
        on: ISODate;
        quote: CurrencyCode;
    }): number;
}
