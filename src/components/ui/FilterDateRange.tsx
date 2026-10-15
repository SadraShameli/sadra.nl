'use client';

import { type DateRange } from 'react-day-picker';

import { DateRangePicker } from '~/components/ui/DatePicker';

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
            className="h-8 w-full text-xs md:w-auto"
            maxDate={maxDate}
            minDate={minDate}
            onChange={onChange}
            placeholder={placeholder}
            value={value}
        />
    );
}
