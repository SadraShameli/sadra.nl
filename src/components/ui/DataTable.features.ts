import {
    type ColumnDef,
    columnFacetingFeature,
    columnFilteringFeature,
    columnVisibilityFeature,
    createCoreRowModel,
    createFacetedRowModel,
    createFacetedUniqueValues,
    createFilteredRowModel,
    createPaginatedRowModel,
    createSortedRowModel,
    filterFn_arrIncludes,
    filterFn_equals,
    filterFn_includesString,
    filterFn_inDateRange,
    filterFn_inNumberRange,
    filterFn_weakEquals,
    globalFilteringFeature,
    metaHelper,
    type ReactTable,
    type Row,
    type RowData,
    rowExpandingFeature,
    rowPaginationFeature,
    rowSelectionFeature,
    rowSortingFeature,
    sortFn_alphanumeric,
    sortFn_basic,
    sortFn_datetime,
    sortFn_text,
    type Table,
    tableFeatures,
} from '@tanstack/react-table';
import { type ReactNode } from 'react';

export const DataTableFilterFunction = {
    ArrIncludes: 'arrIncludes',
    Equals: 'equals',
    IncludesString: 'includesString',
    InDateRange: 'inDateRange',
    InNumberRange: 'inNumberRange',
    WeakEquals: 'weakEquals',
} as const;

export type DataTableFilterFunction =
    (typeof DataTableFilterFunction)[keyof typeof DataTableFilterFunction];

export const DataTableSortFunction = {
    Alphanumeric: 'alphanumeric',
    Basic: 'basic',
    Datetime: 'datetime',
    Text: 'text',
} as const;

export type DataTableSortFunction =
    (typeof DataTableSortFunction)[keyof typeof DataTableSortFunction];

export const dataTableFilterFns = {
    [DataTableFilterFunction.ArrIncludes]: filterFn_arrIncludes,
    [DataTableFilterFunction.Equals]: filterFn_equals,
    [DataTableFilterFunction.IncludesString]: filterFn_includesString,
    [DataTableFilterFunction.InDateRange]: filterFn_inDateRange,
    [DataTableFilterFunction.InNumberRange]: filterFn_inNumberRange,
    [DataTableFilterFunction.WeakEquals]: filterFn_weakEquals,
};

export const dataTableSortFns = {
    [DataTableSortFunction.Alphanumeric]: sortFn_alphanumeric,
    [DataTableSortFunction.Basic]: sortFn_basic,
    [DataTableSortFunction.Datetime]: sortFn_datetime,
    [DataTableSortFunction.Text]: sortFn_text,
};

export const DataTableAlign = {
    Center: 'center',
    End: 'end',
    Start: 'start',
} as const;

export type DataTableAlign =
    (typeof DataTableAlign)[keyof typeof DataTableAlign];

export const DATA_TABLE_ALIGN_CLASS_NAME: Record<DataTableAlign, string> = {
    [DataTableAlign.Center]: 'text-center',
    [DataTableAlign.End]: 'text-right',
    [DataTableAlign.Start]: 'text-left',
};

export type DataTableColumnMeta = {
    align?: DataTableAlign;
    label?: string;
};

export const dataTableFeatures = tableFeatures({
    columnFacetingFeature,
    columnFilteringFeature,
    columnMeta: metaHelper<DataTableColumnMeta>(),
    columnVisibilityFeature,
    coreRowModel: createCoreRowModel(),
    facetedRowModel: createFacetedRowModel(),
    facetedUniqueValues: createFacetedUniqueValues(),
    filteredRowModel: createFilteredRowModel(),
    filterFns: dataTableFilterFns,
    globalFilteringFeature,
    paginatedRowModel: createPaginatedRowModel(),
    rowExpandingFeature,
    rowPaginationFeature,
    rowSelectionFeature,
    rowSortingFeature,
    sortedRowModel: createSortedRowModel(),
    sortFns: dataTableSortFns,
});

export type DataTableColumn<TData extends RowData> = ColumnDef<
    typeof dataTableFeatures,
    TData
>;

export type DataTableInstance<TData extends RowData> = ReactTable<
    typeof dataTableFeatures,
    TData
>;

export type DataTableRow<TData extends RowData> = Row<
    typeof dataTableFeatures,
    TData
>;

export type DataTableServerPagination = {
    hasNextPage: boolean;
    isPending?: boolean;
    onPageIndexChange: (pageIndex: number) => void;
    pageIndex: number;
    pageSize: number;
};

export type DataTableSlot<TData extends RowData> =
    ((table: DataTableInstance<TData>) => ReactNode) | ReactNode;

export function hasActiveColumnFilter<TData extends RowData>(
    table: Table<typeof dataTableFeatures, TData>,
): boolean {
    return table.store.state.columnFilters.length > 0;
}
