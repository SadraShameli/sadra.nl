'use client';

import {
    type ColumnFiltersState,
    type ColumnVisibilityState,
    flexRender,
    type ReactTable,
    type RowData,
    type RowSelectionState,
    type SortingState,
    useTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from 'lucide-react';
import { Fragment, useState } from 'react';

import {
    DATA_TABLE_ALIGN_CLASS_NAME,
    DataTableAlign,
    type DataTableColumn,
    dataTableFeatures,
    type DataTableRow,
    type DataTableServerPagination,
    type DataTableSlot,
} from '~/components/ui/DataTable.features';
import {
    DataTableClientPagination,
    DataTableServerPaginationControls,
} from '~/components/ui/DataTablePagination';
import { EmptyState } from '~/components/ui/EmptyState';
import { Input } from '~/components/ui/Input';
import { Skeleton } from '~/components/ui/Skeleton';
import {
    Table,
    TableBody,
    TableCell,
    TableFooter,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';
import { cn } from '~/lib/utilities';

export {
    DataTableAlign,
    type DataTableColumn,
    type DataTableColumnMeta,
    DataTableFilterFunction,
    type DataTableInstance,
    type DataTableRow,
    type DataTableServerPagination,
    type DataTableSlot,
    DataTableSortFunction,
    hasActiveColumnFilter,
} from '~/components/ui/DataTable.features';

export type DataTableProperties<TData extends RowData> = {
    belowFilter?: DataTableSlot<TData>;
    className?: string;
    columns: DataTableColumn<TData>[];
    data: TData[];
    emptyMessage?: string;
    emptyState?: DataTableSlot<TData>;
    filterPlaceholder?: string;
    filterPosition?: 'bottom' | 'top';
    footer?: DataTableSlot<TData>;
    getRowCanExpand?: (row: DataTableRow<TData>) => boolean;
    headerActions?: DataTableSlot<TData>;
    initialColumnVisibility?: ColumnVisibilityState;
    initialSorting?: SortingState;
    isLoading?: boolean;
    onRowSelectionChange?: (rows: TData[]) => void;
    onSortingChange?: (sorting: SortingState) => void;
    pageSize?: null | number;
    renderExpanded?: (row: DataTableRow<TData>) => React.ReactNode;
    rowClassName?: (row: TData) => string | undefined;
    rowId?: (row: TData) => string;
    rowSelection?: boolean;
    serverPagination?: DataTableServerPagination;
    showFilter?: boolean;
    skeletonRows?: number;
    tableClassName?: string;
};

export function DataTable<TData extends RowData>({
    belowFilter,
    className,
    columns,
    data,
    emptyMessage = 'No rows.',
    emptyState,
    filterPlaceholder = 'Search…',
    filterPosition = 'top',
    footer,
    getRowCanExpand,
    headerActions,
    initialColumnVisibility,
    initialSorting,
    isLoading,
    onRowSelectionChange,
    onSortingChange,
    pageSize = 10,
    renderExpanded,
    rowClassName,
    rowId,
    rowSelection: enableSelection = false,
    serverPagination,
    showFilter = false,
    skeletonRows = 5,
    tableClassName,
}: DataTableProperties<TData>) {
    const [sorting, setSorting] = useState<SortingState>(initialSorting ?? []);
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
    const [globalFilter, setGlobalFilter] = useState('');
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

    const table = useTable({
        autoResetExpanded: false,
        columns,
        data,
        enableRowSelection: enableSelection,
        features: dataTableFeatures,
        getRowCanExpand,
        getRowId: rowId ? (row) => rowId(row) : (_row, index) => String(index),
        initialState: {
            columnVisibility: initialColumnVisibility,
            pagination: {
                pageIndex: 0,
                pageSize: serverPagination?.pageSize ?? pageSize ?? Infinity,
            },
        },
        manualPagination: serverPagination !== undefined,
        manualSorting: onSortingChange !== undefined,
        onColumnFiltersChange: setColumnFilters,
        onGlobalFilterChange: setGlobalFilter,
        onRowSelectionChange: (updater) => {
            const next =
                typeof updater === 'function' ? updater(rowSelection) : updater;
            setRowSelection(next);
            if (onRowSelectionChange) {
                const selectedRows = table
                    .getFilteredRowModel()
                    .rows.filter((r) => next[r.id])
                    .map((r) => r.original);
                onRowSelectionChange(selectedRows);
            }
        },
        onSortingChange: (updater) => {
            const next =
                typeof updater === 'function' ? updater(sorting) : updater;
            setSorting(next);
            onSortingChange?.(next);
        },
        state: {
            columnFilters,
            globalFilter,
            rowSelection,
            sorting,
        },
    });

    const colCount = table.getVisibleLeafColumns().length;

    return (
        <div className={cn('flex w-full min-w-0 flex-col gap-3', className)}>
            {(showFilter ||
                headerActions !== undefined ||
                belowFilter !== undefined) &&
                (filterPosition === 'bottom' ? (
                    <div className="flex flex-col gap-2">
                        {renderDataTableSlot(headerActions, table)}
                        {(showFilter || belowFilter) && (
                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-3">
                                {showFilter ? (
                                    <Input
                                        className="h-8 max-w-xs text-xs"
                                        onChange={(event) =>
                                            setGlobalFilter(event.target.value)
                                        }
                                        placeholder={filterPlaceholder}
                                        value={globalFilter}
                                    />
                                ) : (
                                    <span />
                                )}
                                {renderDataTableSlot(belowFilter, table)}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        {showFilter ? (
                            <Input
                                className="h-8 max-w-xs text-xs"
                                onChange={(event) =>
                                    setGlobalFilter(event.target.value)
                                }
                                placeholder={filterPlaceholder}
                                value={globalFilter}
                            />
                        ) : (
                            <span />
                        )}
                        {renderDataTableSlot(headerActions, table)}
                    </div>
                ))}
            <div className="w-full min-w-0 overflow-hidden rounded-lg border border-border/60 bg-background">
                <Table
                    className={cn(
                        'min-w-max whitespace-nowrap',
                        tableClassName,
                    )}
                >
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => {
                                    const isSortable =
                                        header.column.getCanSort();
                                    const sorted = header.column.getIsSorted();
                                    const align =
                                        header.column.columnDef.meta?.align;
                                    const headerLabel =
                                        header.column.columnDef.meta?.label ??
                                        flexRender(
                                            header.column.columnDef.header,
                                            header.getContext(),
                                        );
                                    return (
                                        <TableHead
                                            className={
                                                align
                                                    ? DATA_TABLE_ALIGN_CLASS_NAME[
                                                          align
                                                      ]
                                                    : undefined
                                            }
                                            key={header.id}
                                        >
                                            {header.isPlaceholder ? null : isSortable ? (
                                                <button
                                                    className={cn(
                                                        'flex items-center gap-1 text-left transition-colors hover:text-white',
                                                        align ===
                                                            DataTableAlign.End &&
                                                            'w-full justify-end',
                                                        align ===
                                                            DataTableAlign.Center &&
                                                            'w-full justify-center',
                                                    )}
                                                    onClick={header.column.getToggleSortingHandler()}
                                                    type="button"
                                                >
                                                    {headerLabel}
                                                    {sorted === 'asc' && (
                                                        <ArrowUp className="size-3" />
                                                    )}
                                                    {sorted === 'desc' && (
                                                        <ArrowDown className="size-3" />
                                                    )}
                                                    {sorted === false && (
                                                        <ArrowUpDown className="size-3 opacity-30" />
                                                    )}
                                                </button>
                                            ) : (
                                                headerLabel
                                            )}
                                        </TableHead>
                                    );
                                })}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody key={isLoading ? 'skeleton' : 'data'}>
                        {isLoading ? (
                            Array.from({ length: skeletonRows }, (_, index) => (
                                <TableRow
                                    className="animate-in duration-500 fade-in-0 fill-mode-both"
                                    key={`skeleton-${index}`}
                                    style={{
                                        animationDelay: `${index * 50}ms`,
                                    }}
                                >
                                    {Array.from(
                                        { length: colCount },
                                        (_unused, index) => (
                                            <TableCell key={index}>
                                                <Skeleton className="h-4 w-full" />
                                            </TableCell>
                                        ),
                                    )}
                                </TableRow>
                            ))
                        ) : table.getRowModel().rows.length === 0 ? (
                            <TableRow className="animate-in duration-500 fade-in-0 fill-mode-both hover:bg-transparent">
                                <TableCell className="p-0" colSpan={colCount}>
                                    {renderDataTableSlot(emptyState, table) ?? (
                                        <EmptyState title={emptyMessage} />
                                    )}
                                </TableCell>
                            </TableRow>
                        ) : (
                            table.getRowModel().rows.map((row, index) => {
                                const delay = `${Math.min(index, 12) * 35}ms`;
                                return (
                                    <Fragment key={row.id}>
                                        <TableRow
                                            className={cn(
                                                'animate-in duration-500 fade-in-0 fill-mode-both',
                                                rowClassName?.(row.original),
                                            )}
                                            data-state={
                                                row.getIsSelected()
                                                    ? 'selected'
                                                    : undefined
                                            }
                                            style={{ animationDelay: delay }}
                                        >
                                            {row
                                                .getVisibleCells()
                                                .map((cell) => {
                                                    const align =
                                                        cell.column.columnDef
                                                            .meta?.align;
                                                    return (
                                                        <TableCell
                                                            className={
                                                                align
                                                                    ? DATA_TABLE_ALIGN_CLASS_NAME[
                                                                          align
                                                                      ]
                                                                    : undefined
                                                            }
                                                            key={cell.id}
                                                        >
                                                            <div
                                                                className="animate-in duration-500 fade-in-0 fill-mode-both slide-in-from-bottom-1"
                                                                style={{
                                                                    animationDelay:
                                                                        delay,
                                                                }}
                                                            >
                                                                {flexRender(
                                                                    cell.column
                                                                        .columnDef
                                                                        .cell,
                                                                    cell.getContext(),
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                    );
                                                })}
                                        </TableRow>
                                        {renderExpanded &&
                                            row.getIsExpanded() && (
                                                <TableRow className="hover:bg-transparent">
                                                    <TableCell
                                                        className="p-0"
                                                        colSpan={colCount}
                                                    >
                                                        {renderExpanded(row)}
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                    </Fragment>
                                );
                            })
                        )}
                    </TableBody>
                    {footer !== undefined && !isLoading && data.length > 0 && (
                        <TableFooter>
                            {renderDataTableSlot(footer, table)}
                        </TableFooter>
                    )}
                </Table>
            </div>
            {serverPagination ? (
                <DataTableServerPaginationControls
                    pagination={serverPagination}
                    rowCount={data.length}
                />
            ) : (
                pageSize !== null &&
                table.getPageCount() > 1 && (
                    <DataTableClientPagination table={table} />
                )
            )}
        </div>
    );
}

export function dataTableExpanderColumn<
    TData extends RowData,
>(): DataTableColumn<TData> {
    return {
        cell: ({ row }) =>
            row.getCanExpand() && (
                <button
                    className="flex size-6 items-center justify-center text-muted-foreground transition-colors hover:text-white"
                    onClick={row.getToggleExpandedHandler()}
                    type="button"
                >
                    <ChevronRight
                        className={cn(
                            'size-4 transition-transform',
                            row.getIsExpanded() && 'rotate-90',
                        )}
                    />
                </button>
            ),
        enableSorting: false,
        header: () => <span className="sr-only">Expand</span>,
        id: 'expander',
    };
}

function renderDataTableSlot<TData extends RowData>(
    slot: DataTableSlot<TData> | undefined,
    table: ReactTable<typeof dataTableFeatures, TData>,
): React.ReactNode {
    return typeof slot === 'function' ? slot(table) : slot;
}
