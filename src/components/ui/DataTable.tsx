'use client';

import {
    type ColumnDef,
    type ColumnFiltersState,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    type RowSelectionState,
    type SortingState,
    type Table as TableInstance,
    useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useState } from 'react';

import { Button } from '~/components/ui/Button';
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
import { cn } from '~/lib/utils';

export type DataTableProps<TData, TValue> = {
    belowFilter?: React.ReactNode;
    className?: string;
    columns: ColumnDef<TData, TValue>[];
    data: TData[];
    emptyMessage?: string;
    emptyState?: React.ReactNode;
    filterPlaceholder?: string;
    filterPosition?: 'bottom' | 'top';
    footer?: React.ReactNode;
    headerActions?: React.ReactNode;
    initialSorting?: SortingState;
    isLoading?: boolean;
    onRowSelectionChange?: (rows: TData[]) => void;
    pageSize?: null | number;
    rowClassName?: (row: TData) => string | undefined;
    rowId?: (row: TData) => string;
    rowSelection?: boolean;
    showFilter?: boolean;
    skeletonRows?: number;
    tableClassName?: string;
};

export function DataTable<TData, TValue>({
    belowFilter,
    className,
    columns,
    data,
    emptyMessage = 'No rows.',
    emptyState,
    filterPlaceholder = 'Search…',
    filterPosition = 'top',
    footer,
    headerActions,
    initialSorting,
    isLoading,
    onRowSelectionChange,
    pageSize = 10,
    rowClassName,
    rowId,
    rowSelection: enableSelection = false,
    showFilter = false,
    skeletonRows = 5,
    tableClassName,
}: DataTableProps<TData, TValue>) {
    const [sorting, setSorting] = useState<SortingState>(initialSorting ?? []);
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
    const [globalFilter, setGlobalFilter] = useState('');
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

    const table = useReactTable({
        columns,
        data,
        enableRowSelection: enableSelection,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel:
            pageSize === null ? undefined : getPaginationRowModel(),
        getRowId: rowId ? (row) => rowId(row) : (_row, index) => String(index),
        getSortedRowModel: getSortedRowModel(),
        initialState:
            pageSize === null
                ? undefined
                : { pagination: { pageIndex: 0, pageSize } },
        onColumnFiltersChange: setColumnFilters,
        onGlobalFilterChange: setGlobalFilter,
        onRowSelectionChange: (updater) => {
            setRowSelection((prev) => {
                const next =
                    typeof updater === 'function' ? updater(prev) : updater;
                if (onRowSelectionChange) {
                    const selectedRows = table
                        .getRowModel()
                        .rows.filter((r) => next[r.id])
                        .map((r) => r.original);
                    onRowSelectionChange(selectedRows);
                }
                return next;
            });
        },
        onSortingChange: setSorting,
        state: {
            columnFilters,
            globalFilter,
            rowSelection,
            sorting,
        },
    });

    const colCount = columns.length;

    return (
        <div className={cn('flex w-full min-w-0 flex-col gap-3', className)}>
            {(showFilter ||
                headerActions !== undefined ||
                belowFilter !== undefined) &&
                (filterPosition === 'bottom' ? (
                    <div className="flex flex-col gap-2">
                        {headerActions}
                        {(showFilter || belowFilter) && (
                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-3">
                                {showFilter ? (
                                    <Input
                                        className="h-8 max-w-xs text-xs"
                                        onChange={(e) =>
                                            setGlobalFilter(e.target.value)
                                        }
                                        placeholder={filterPlaceholder}
                                        value={globalFilter}
                                    />
                                ) : (
                                    <span />
                                )}
                                {belowFilter}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        {showFilter ? (
                            <Input
                                className="h-8 max-w-xs text-xs"
                                onChange={(e) =>
                                    setGlobalFilter(e.target.value)
                                }
                                placeholder={filterPlaceholder}
                                value={globalFilter}
                            />
                        ) : (
                            <span />
                        )}
                        {headerActions}
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
                                    const sortable = header.column.getCanSort();
                                    const sorted = header.column.getIsSorted();
                                    return (
                                        <TableHead key={header.id}>
                                            {header.isPlaceholder ? null : sortable ? (
                                                <button
                                                    className="flex items-center gap-1 text-left transition-colors hover:text-white"
                                                    onClick={header.column.getToggleSortingHandler()}
                                                    type="button"
                                                >
                                                    {flexRender(
                                                        header.column.columnDef
                                                            .header,
                                                        header.getContext(),
                                                    )}
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
                                                flexRender(
                                                    header.column.columnDef
                                                        .header,
                                                    header.getContext(),
                                                )
                                            )}
                                        </TableHead>
                                    );
                                })}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody key={isLoading ? 'skeleton' : 'data'}>
                        {isLoading ? (
                            Array.from({ length: skeletonRows }).map((_, i) => (
                                <TableRow
                                    className="animate-in duration-500 fade-in-0 fill-mode-both"
                                    key={`skeleton-${i}`}
                                    style={{
                                        animationDelay: `${i * 50}ms`,
                                    }}
                                >
                                    {Array.from({ length: colCount }).map(
                                        (_unused, j) => (
                                            <TableCell key={j}>
                                                <Skeleton className="h-4 w-full" />
                                            </TableCell>
                                        ),
                                    )}
                                </TableRow>
                            ))
                        ) : table.getRowModel().rows.length === 0 ? (
                            <TableRow className="animate-in duration-500 fade-in-0 fill-mode-both hover:bg-transparent">
                                <TableCell className="p-0" colSpan={colCount}>
                                    {emptyState ?? (
                                        <EmptyState title={emptyMessage} />
                                    )}
                                </TableCell>
                            </TableRow>
                        ) : (
                            table.getRowModel().rows.map((row, i) => {
                                const delay = `${Math.min(i, 12) * 35}ms`;
                                return (
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
                                        key={row.id}
                                        style={{ animationDelay: delay }}
                                    >
                                        {row.getVisibleCells().map((cell) => (
                                            <TableCell key={cell.id}>
                                                <div
                                                    className="animate-in duration-500 fade-in-0 fill-mode-both slide-in-from-bottom-1"
                                                    style={{
                                                        animationDelay: delay,
                                                    }}
                                                >
                                                    {flexRender(
                                                        cell.column.columnDef
                                                            .cell,
                                                        cell.getContext(),
                                                    )}
                                                </div>
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                    {footer && !isLoading && data.length > 0 && (
                        <TableFooter>{footer}</TableFooter>
                    )}
                </Table>
            </div>
            {pageSize !== null && table.getPageCount() > 1 && (
                <Pagination table={table} />
            )}
        </div>
    );
}

function Pagination<TData>({ table }: { table: TableInstance<TData> }) {
    const pageIndex = table.getState().pagination.pageIndex;
    const pageCount = table.getPageCount();
    return (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
                Page {pageIndex + 1} of {pageCount}
            </span>
            <div className="flex gap-2">
                <Button
                    disabled={!table.getCanPreviousPage()}
                    onClick={() => table.previousPage()}
                    size="sm"
                    variant="outline"
                >
                    Previous
                </Button>
                <Button
                    disabled={!table.getCanNextPage()}
                    onClick={() => table.nextPage()}
                    size="sm"
                    variant="outline"
                >
                    Next
                </Button>
            </div>
        </div>
    );
}
