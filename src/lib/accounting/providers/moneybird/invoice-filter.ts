import type { DateBounds } from '~/lib/accounting/providers/date-filter';

import { type ISODate, IsoDate } from '~/lib/accounting/core/date';

const EARLIEST_DOCUMENT_DATE = IsoDate.parse('1900-01-01');
const LATEST_DOCUMENT_DATE = IsoDate.parse('9999-12-31');
const ISO_DATE_SEPARATOR = '-';
const PERIOD_RANGE_SEPARATOR = '..';
const TERM_SEPARATOR = ',';
const KEY_SEPARATOR = ':';

enum InvoiceFilterKey {
    Period = 'period',
    State = 'state',
}

enum InvoiceState {
    All = 'all',
}

export class InvoiceFilter {
    static within({ from, to }: DateBounds): InvoiceFilter {
        return new InvoiceFilter(
            from ?? EARLIEST_DOCUMENT_DATE,
            to ?? LATEST_DOCUMENT_DATE,
        );
    }

    private constructor(
        private readonly from: ISODate,
        private readonly to: ISODate,
    ) {}

    private period(): string {
        return [this.from, this.to]
            .map((date) => date.replaceAll(ISO_DATE_SEPARATOR, ''))
            .join(PERIOD_RANGE_SEPARATOR);
    }

    toParams(): Record<string, string> {
        return {
            filter: [
                [InvoiceFilterKey.Period, this.period()],
                [InvoiceFilterKey.State, InvoiceState.All],
            ]
                .map((term) => term.join(KEY_SEPARATOR))
                .join(TERM_SEPARATOR),
        };
    }
}
