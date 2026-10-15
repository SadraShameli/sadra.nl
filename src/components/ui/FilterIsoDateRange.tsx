'use client';

import { format, parseISO } from 'date-fns';

import { FilterDateRange } from '~/components/ui/FilterDateRange';

const ISO_DATE_FORMAT = 'yyyy-MM-dd';

export type FilterIsoDateRangeProperties = {
    align?: 'center' | 'end' | 'start';
    label: string;
    max?: string;
    min?: string;
    onChange: (range: IsoDateRange) => void;
    placeholder: string;
    value: IsoDateRange;
};

export type IsoDateRange = {
    from: null | string;
    to: null | string;
};

export function FilterIsoDateRange({
    align,
    label,
    max,
    min,
    onChange,
    placeholder,
    value,
}: FilterIsoDateRangeProperties) {
    return (
        <FilterDateRange
            align={align}
            label={label}
            maxDate={max === undefined ? undefined : parseISO(max)}
            minDate={min === undefined ? undefined : parseISO(min)}
            onChange={(range) =>
                onChange({
                    from: range?.from
                        ? format(range.from, ISO_DATE_FORMAT)
                        : null,
                    to: range?.to ? format(range.to, ISO_DATE_FORMAT) : null,
                })
            }
            placeholder={placeholder}
            value={
                value.from === null && value.to === null
                    ? undefined
                    : {
                          from:
                              value.from === null
                                  ? undefined
                                  : parseISO(value.from),
                          to:
                              value.to === null
                                  ? undefined
                                  : parseISO(value.to),
                      }
            }
        />
    );
}
