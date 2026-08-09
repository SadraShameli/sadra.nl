'use client';

import { type Column, type RowData } from '@tanstack/react-table';

import { type dataTableFeatures } from '~/components/ui/DataTable.features';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
import { cn } from '~/lib/utilities';

const ALL_VALUE = '__all__';

export type DataTableFacetSelectProperties<TData extends RowData> = {
    className?: string;
    column: Column<typeof dataTableFeatures, TData> | undefined;
    format?: (value: string) => React.ReactNode;
    placeholder: string;
};

export function DataTableFacetSelect<TData extends RowData>({
    className,
    column,
    format,
    placeholder,
}: DataTableFacetSelectProperties<TData>) {
    if (!column) return null;

    const facets = column.getFacetedUniqueValues();
    const options = [...facets]
        .filter(
            (entry): entry is [string, number] => typeof entry[0] === 'string',
        )
        .toSorted(([a], [b]) => a.localeCompare(b));
    const value = (column.getFilterValue() as string | undefined) ?? ALL_VALUE;

    return (
        <Select
            onValueChange={(next) =>
                column.setFilterValue(next === ALL_VALUE ? undefined : next)
            }
            value={value}
        >
            <SelectTrigger className={cn('h-8 shrink-0 text-xs', className)}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={ALL_VALUE}>{placeholder}</SelectItem>
                {options.map(([optionValue, count]) => (
                    <SelectItem key={optionValue} value={optionValue}>
                        {format ? format(optionValue) : optionValue} ({count})
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
