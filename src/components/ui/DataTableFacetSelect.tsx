'use client';

import { type Column, type RowData } from '@tanstack/react-table';

import { type dataTableFeatures } from '~/components/ui/DataTable.features';
import { FilterSelect } from '~/components/ui/FilterSelect';

export type DataTableFacetSelectProperties<TData extends RowData> = {
    column: Column<typeof dataTableFeatures, TData> | undefined;
    format?: (value: string) => React.ReactNode;
    label?: string;
    placeholder: string;
};

export function DataTableFacetSelect<TData extends RowData>({
    column,
    format,
    label,
    placeholder,
}: DataTableFacetSelectProperties<TData>) {
    if (!column) return null;

    const options = [...column.getFacetedUniqueValues()]
        .filter(
            (entry): entry is [string, number] => typeof entry[0] === 'string',
        )
        .toSorted(([a], [b]) => a.localeCompare(b))
        .map(([value, count]) => ({
            count,
            label: format ? format(value) : value,
            value,
        }));

    return (
        <FilterSelect
            label={label}
            onValueChange={(next) => column.setFilterValue(next)}
            options={options}
            placeholder={placeholder}
            value={column.getFilterValue() as string | undefined}
        />
    );
}
