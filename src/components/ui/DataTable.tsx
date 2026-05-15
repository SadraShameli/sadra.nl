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
import { Input } from '~/components/ui/Input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';
import { cn } from '~/lib/utils';

export type DataTableProps<TData, TValue> = {
    className?: string;
    columns: ColumnDef<TData, TValue>[];
    data: TData[];
    emptyMessage?: string;
    filterPlaceholder?: string;
    headerActions?: React.ReactNode;
    isLoading?: boolean;
    onRowSelectionChange?: (rows: TData[]) => void;
    pageSize?: null | number;
    rowClassName?: (row: TData) => string | undefined;
    rowId?: (row: TData) => string;
    rowSelection?: boolean;
    showFilter?: boolean;
    tableClassName?: string;
};

export function DataTable<TData, TValue>({
    className,
    columns,
    data,
    emptyMessage = 'No rows.',
    filterPlaceholder = 'Search…',
    headerActions,
    isLoading,
    onRowSelectionChange,
    pageSize = 10,
    rowClassName,
    rowId,
    rowSelection: enableSelection = false,
    showFilter = false,
    tableClassName,
}: DataTableProps<TData, TValue>) {
    const [sorting, setSorting] = useState<SortingState>([]);
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
        <div className={cn('flex flex-col gap-3', className)}>
            {(showFilter || headerActions) && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                    {showFilter ? (
                        <Input
                            className="h-8 max-w-xs text-xs"
                            onChange={(e) => setGlobalFilter(e.target.value)}
                            placeholder={filterPlaceholder}
                            value={globalFilter}
                        />
                    ) : (
                        <span />
                    )}
                    {headerActions}
                </div>
            )}
            <div className="overflow-hidden rounded-lg border border-border/60 bg-background">
                <Table className={tableClassName}>
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
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell
                                    className="py-6 text-center text-muted-foreground"
                                    colSpan={colCount}
                                >
                                    Loading…
                                </TableCell>
                            </TableRow>
                        ) : table.getRowModel().rows.length === 0 ? (
                            <TableRow>
                                <TableCell
                                    className="py-6 text-center text-muted-foreground"
                                    colSpan={colCount}
                                >
                                    {emptyMessage}
                                </TableCell>
                            </TableRow>
                        ) : (
                            table.getRowModel().rows.map((row) => (
                                <TableRow
                                    className={cn(rowClassName?.(row.original))}
                                    data-state={
                                        row.getIsSelected()
                                            ? 'selected'
                                            : undefined
                                    }
                                    key={row.id}
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id}>
                                            {flexRender(
                                                cell.column.columnDef.cell,
                                                cell.getContext(),
                                            )}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        )}
                    </TableBody>
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
