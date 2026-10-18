'use client';

import { type DateRange } from 'react-day-picker';

import { DateRangePicker } from '~/components/ui/date-picker';
import { FILTER_CONTROL_CLASS } from '~/components/ui/filter-control';
import { cn } from '~/lib/utilities';

export type FilterDateRangeProperties = {
    align?: 'center' | 'end' | 'start';
    label: string;
    maxDate?: Date;
    minDate?: Date;
    onChange: (range: DateRange | undefined) => void;
    placeholder: string;
    value: DateRange | undefined;
};

export function FilterDateRange({
    align,
    label,
    maxDate,
    minDate,
    onChange,
    placeholder,
    value,
}: FilterDateRangeProperties) {
    return (
        <DateRangePicker
            align={align}
            aria-label={label}
            className={cn(FILTER_CONTROL_CLASS, 'w-auto')}
            maxDate={maxDate}
            minDate={minDate}
            onChange={onChange}
            placeholder={placeholder}
            value={value}
        />
    );
}
