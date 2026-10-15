'use client';

import { type Column, type RowData } from '@tanstack/react-table';
import { endOfDay, startOfDay } from 'date-fns';
import { useState } from 'react';
import { type DateRange } from 'react-day-picker';

import { type dataTableFeatures } from '~/components/ui/DataTable.features';
import { FilterDateRange } from '~/components/ui/FilterDateRange';

export type DataTableDateRangeProperties<TData extends RowData> = {
    align?: 'center' | 'end' | 'start';
    column: Column<typeof dataTableFeatures, TData> | undefined;
    label: string;
    maxDate?: Date;
    minDate?: Date;
    placeholder: string;
};

export function DataTableDateRange<TData extends RowData>({
    align,
    column,
    label,
    maxDate,
    minDate,
    placeholder,
}: DataTableDateRangeProperties<TData>) {
    const [range, setRange] = useState<DateRange | undefined>();

    if (!column) return null;

    return (
        <FilterDateRange
            align={align}
            label={label}
            maxDate={maxDate}
            minDate={minDate}
            onChange={(next) => {
                setRange(next);
                column.setFilterValue(
                    next?.from
                        ? [
                              startOfDay(next.from).getTime(),
                              endOfDay(next.to ?? next.from).getTime(),
                          ]
                        : undefined,
                );
            }}
            placeholder={placeholder}
            value={displayedRange(column.getFilterValue(), range)}
        />
    );
}

function displayedRange(
    filterValue: unknown,
    picked: DateRange | undefined,
): DateRange | undefined {
    if (!Array.isArray(filterValue)) return undefined;
    if (picked) return picked;
    const from: unknown = filterValue[0];
    const to: unknown = filterValue[1];
    return typeof from === 'number' && typeof to === 'number'
        ? { from: new Date(from), to: new Date(to) }
        : undefined;
}
