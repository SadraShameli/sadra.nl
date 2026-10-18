import type { MutationDateRange } from '~/lib/accounting/providers/provider';

import { type ISODate, IsoDate } from '~/lib/accounting/core/date';

const DATE_PARAMETER = 'date';
const RANGE_SEPARATOR = ',';
const LOOKBACK_DAYS = [31, 366, 3660] as const;

enum DateFilterOperator {
    From = 'gte',
    Range = 'range',
    Until = 'lte',
}

export interface DateBounds {
    readonly from?: ISODate;
    readonly to?: ISODate;
}

export class DateFilter {
    static between({ from, to }: DateBounds): DateFilter | null {
        if (from !== undefined && to !== undefined) {
            return new DateFilter(
                DateFilterOperator.Range,
                [from, to].join(RANGE_SEPARATOR),
            );
        }
        if (from !== undefined) {
            return new DateFilter(DateFilterOperator.From, from);
        }
        return to === undefined
            ? null
            : new DateFilter(DateFilterOperator.Until, to);
    }

    static boundsOf(range: MutationDateRange): DateBounds {
        return {
            from:
                range.dateFrom === undefined
                    ? undefined
                    : IsoDate.parse(range.dateFrom),
            to:
                range.dateTo === undefined
                    ? undefined
                    : IsoDate.parse(range.dateTo),
        };
    }

    static newestFirstSlices(bounds: DateBounds, today: ISODate): DateBounds[] {
        const { from, to } = bounds;
        if (
            from !== undefined &&
            to !== undefined &&
            IsoDate.isAfter(from, to)
        ) {
            return [];
        }
        const anchor = to ?? today;
        const slices: DateBounds[] = [];
        let upper = to;
        for (const days of LOOKBACK_DAYS) {
            const lookback = IsoDate.addDays(anchor, -days);
            const lower =
                from !== undefined && IsoDate.isSameOrAfter(from, lookback)
                    ? from
                    : lookback;
            slices.push({ from: lower, to: upper });
            if (lower === from) return slices;
            upper = IsoDate.addDays(lower, -1);
        }
        slices.push({ from, to: upper });
        return slices;
    }

    private constructor(
        private readonly operator: DateFilterOperator,
        private readonly value: string,
    ) {}

    toParams(): Record<string, string> {
        return { [`${DATE_PARAMETER}[${this.operator}]`]: this.value };
    }
}
