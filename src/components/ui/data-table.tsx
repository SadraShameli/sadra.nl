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

import { ClearFiltersButton } from '~/components/ui/clear-filters-button';
import {
    DataTableClientPagination,
    DataTableServerPaginationControls,
} from '~/components/ui/data-table-pagination';
import {
    DATA_TABLE_ALIGN_CLASS_NAME,
    DataTableAlign,
    type DataTableColumn,
    dataTableFeatures,
    DataTablePhoneLayout,
    type DataTableRow,
    type DataTableServerPagination,
    type DataTableSlot,
    hasActiveTableFilter,
} from '~/components/ui/data-table.features';
import { EmptyState } from '~/components/ui/empty-state';
import { SEARCH_FIELD_CLASS } from '~/components/ui/filter-control';
import { Input } from '~/components/ui/input';
import { Skeleton } from '~/components/ui/skeleton';
import {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableGroupHeader,
    TableHead,
    TableHeader,
    TableRow,
    TableRowHeader,
} from '~/components/ui/table';
import { cn } from '~/lib/utilities';

export const DATA_TABLE_PAGE_SIZE = 25;

export {
    DataTableAlign,
    type DataTableColumn,
    type DataTableColumnMeta,
    type DataTableCore,
    DataTableFilterFunction,
    type DataTableInstance,
    DataTablePhoneLayout,
    type DataTableRow,
    type DataTableServerPagination,
    type DataTableSlot,
    DataTableSortFunction,
    hasActiveTableFilter,
} from '~/components/ui/data-table.features';

const DATA_TABLE_ROW_HEIGHT_REM = 2.25;

const PHONE_CARD_CLASS = {
    actionsCell: 'max-md:absolute max-md:top-3 max-md:right-3 max-md:p-0',
    body: 'max-md:flex max-md:flex-col max-md:gap-3 max-md:[&_tr:last-child]:border',
    container: 'max-md:overflow-visible',
    fullRow: 'max-md:block max-md:border-0 max-md:bg-transparent',
    fullRowCell: 'max-md:block max-md:px-0',
    header: 'max-md:hidden',
    hidden: 'max-md:hidden',
    labelledCell:
        'max-md:flex max-md:flex-wrap max-md:items-baseline max-md:justify-between max-md:gap-x-4 max-md:gap-y-0.5 max-md:p-0 max-md:text-right max-md:break-words max-md:[&>*]:ml-auto max-md:[&>*]:max-w-full max-md:[&>*]:min-w-0 max-md:before:max-w-full max-md:before:text-left max-md:before:type-micro max-md:before:text-ink-muted max-md:before:content-[attr(data-label)]',
    plainCell:
        'max-md:block max-md:min-w-0 max-md:p-0 max-md:text-left max-md:break-words',
    row: 'max-md:relative max-md:flex max-md:flex-col max-md:gap-2 max-md:rounded-lg max-md:border max-md:border-line max-md:bg-card max-md:p-4',
    rowHeaderCell:
        'max-md:order-first max-md:block max-md:p-0 max-md:pr-10 max-md:text-left max-md:font-medium max-md:text-ink',
    table: 'max-md:block max-md:min-w-0 max-md:whitespace-normal',
    wrapper:
        'max-md:overflow-visible max-md:rounded-none max-md:border-0 max-md:bg-transparent',
} as const;

type DataTableSearch = {
    readonly onChange: (value: string) => void;
    readonly value: string;
};

const ARIA_SORT = {
    asc: 'ascending',
    desc: 'descending',
    none: 'none',
} as const;

export type DataTableProperties<TData extends RowData> = {
    'aria-label'?: string;
    belowFilter?: DataTableSlot<TData>;
    caption?: string;
    className?: string;
    columns: DataTableColumn<TData>[];
    data: TData[];
    emptyMessage?: string;
    emptyState?: DataTableSlot<TData>;
    filterPlaceholder?: string;
    filterPosition?: 'bottom' | 'top';
    getRowCanExpand?: (row: DataTableRow<TData>) => boolean;
    hasExternalFilters?: boolean;
    headerActions?: DataTableSlot<TData>;
    initialColumnVisibility?: ColumnVisibilityState;
    initialSorting?: SortingState;
    isLoading?: boolean;
    isSortable?: boolean;
    labelledBy?: string;
    onResetFilters?: () => void;
    onRowSelectionChange?: (rows: TData[]) => void;
    onSortingChange?: (sorting: SortingState) => void;
    pageSize?: null | number;
    phoneLayout?: DataTablePhoneLayout;
    regionLabel?: string;
    renderExpanded?: (row: DataTableRow<TData>) => React.ReactNode;
    rowClassName?: (row: TData) => string | undefined;
    rowGroupHeading?: (row: TData) => React.ReactNode;
    rowId?: (row: TData) => string;
    rowMessage?: (row: TData) => React.ReactNode;
    rowSelection?: boolean;
    search?: DataTableSearch;
    serverPagination?: DataTableServerPagination;
    showFilter?: boolean;
    skeletonRows?: number;
    tableClassName?: string;
    toolbarEnd?: React.ReactNode;
};

export function DataTable<TData extends RowData>({
    'aria-label': ariaLabel,
    belowFilter,
    caption,
    className,
    columns,
    data,
    emptyMessage = 'No rows.',
    emptyState,
    filterPlaceholder = 'Search…',
    filterPosition = 'top',
    getRowCanExpand,
    hasExternalFilters = false,
    headerActions,
    initialColumnVisibility,
    initialSorting,
    isLoading,
    isSortable = true,
    labelledBy,
    onResetFilters,
    onRowSelectionChange,
    onSortingChange,
    pageSize = DATA_TABLE_PAGE_SIZE,
    phoneLayout = DataTablePhoneLayout.Cards,
    regionLabel,
    renderExpanded,
    rowClassName,
    rowGroupHeading,
    rowId,
    rowMessage,
    rowSelection: enableSelection = false,
    search,
    serverPagination,
    showFilter = false,
    skeletonRows = 5,
    tableClassName,
    toolbarEnd,
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
        enableSorting: isSortable,
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
            if (!onRowSelectionChange) return;
            const selectedRows = table
                .getFilteredRowModel()
                .rows.filter((r) => next[r.id])
                .map((r) => r.original);
            onRowSelectionChange(selectedRows);
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

    const isCards = phoneLayout === DataTablePhoneLayout.Cards;
    const colCount = table.getVisibleLeafColumns().length;
    const pageRows = table.getRowModel().rows;
    const loadedRowCount = table.getCoreRowModel().rows.length;
    const fullPageSize = serverPagination?.pageSize ?? pageSize;
    const reservedRows =
        fullPageSize === null || isLoading === true
            ? 0
            : Math.min(
                  fullPageSize,
                  serverPagination ? fullPageSize : loadedRowCount,
              );
    const fillerRows = Math.max(0, reservedRows - pageRows.length);
    const hasClientPages = pageSize !== null && loadedRowCount > pageSize;
    const searchValue = search?.value ?? globalFilter;
    const changeSearch = search?.onChange ?? setGlobalFilter;
    const clearFilters = (
        <ClearFiltersButton
            active={
                hasActiveTableFilter(table) ||
                hasExternalFilters ||
                searchValue !== ''
            }
            onReset={() => {
                changeSearch('');
                setColumnFilters([]);
                onResetFilters?.();
            }}
        />
    );

    const searchField = showFilter ? (
        <Input
            aria-label={filterPlaceholder}
            className={SEARCH_FIELD_CLASS}
            onChange={(event) => changeSearch(event.target.value)}
            placeholder={filterPlaceholder}
            value={searchValue}
        />
    ) : null;

    return (
        <div className={cn('flex w-full min-w-0 flex-col gap-3', className)}>
            {(showFilter ||
                headerActions !== undefined ||
                belowFilter !== undefined ||
                toolbarEnd !== undefined) &&
                (filterPosition === 'bottom' ? (
                    <div className="flex flex-col gap-2">
                        {renderDataTableSlot(headerActions, table)}
                        <div className="flex flex-wrap items-center gap-2">
                            {renderDataTableSlot(belowFilter, table)}
                            {searchField}
                            {clearFilters}
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-wrap items-center gap-2">
                        {renderDataTableSlot(headerActions, table)}
                        {searchField}
                        {clearFilters}
                        {toolbarEnd === undefined ? null : (
                            <div className="flex flex-wrap items-center gap-2">
                                {toolbarEnd}
                            </div>
                        )}
                    </div>
                ))}
            <div
                className={cn(
                    'w-full min-w-0 overflow-hidden rounded-lg border border-line bg-background',
                    isCards && PHONE_CARD_CLASS.wrapper,
                )}
            >
                <Table
                    aria-label={ariaLabel}
                    aria-labelledby={labelledBy}
                    className={cn(
                        'min-w-max whitespace-nowrap',
                        isCards && PHONE_CARD_CLASS.table,
                        tableClassName,
                    )}
                    containerClassName={
                        isCards ? PHONE_CARD_CLASS.container : undefined
                    }
                    containerProps={
                        labelledBy === undefined && regionLabel === undefined
                            ? undefined
                            : {
                                  'aria-label': regionLabel,
                                  'aria-labelledby': labelledBy,
                                  role: 'region',
                                  tabIndex: 0,
                              }
                    }
                >
                    {caption === undefined ? null : (
                        <TableCaption className="sr-only">
                            {caption}
                        </TableCaption>
                    )}
                    <TableHeader
                        className={
                            isCards ? PHONE_CARD_CLASS.header : undefined
                        }
                    >
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
                                            aria-sort={
                                                isSortable
                                                    ? ARIA_SORT[
                                                          sorted === false
                                                              ? 'none'
                                                              : sorted
                                                      ]
                                                    : undefined
                                            }
                                            className={
                                                align
                                                    ? DATA_TABLE_ALIGN_CLASS_NAME[
                                                          align
                                                      ]
                                                    : undefined
                                            }
                                            key={header.id}
                                            scope="col"
                                        >
                                            {header.isPlaceholder ? null : isSortable ? (
                                                <button
                                                    className={cn(
                                                        'flex items-center gap-1 text-left uppercase transition-colors hover:text-foreground',
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
                    <TableBody
                        className={isCards ? PHONE_CARD_CLASS.body : undefined}
                        key={isLoading ? 'skeleton' : 'data'}
                    >
                        {isLoading ? (
                            Array.from({ length: skeletonRows }, (_, index) => (
                                <TableRow
                                    className={cn(
                                        'animate-in duration-500 fade-in-0 fill-mode-both',
                                        isCards && PHONE_CARD_CLASS.row,
                                    )}
                                    key={`skeleton-${index}`}
                                    style={{
                                        animationDelay: `${index * 50}ms`,
                                    }}
                                >
                                    {Array.from(
                                        { length: colCount },
                                        (_unused, index) => (
                                            <TableCell
                                                className={
                                                    isCards
                                                        ? PHONE_CARD_CLASS.plainCell
                                                        : undefined
                                                }
                                                key={index}
                                            >
                                                <Skeleton className="h-4 w-full" />
                                            </TableCell>
                                        ),
                                    )}
                                </TableRow>
                            ))
                        ) : pageRows.length === 0 ? (
                            <TableRow
                                className={cn(
                                    'animate-in duration-500 fade-in-0 fill-mode-both hover:bg-transparent',
                                    isCards && PHONE_CARD_CLASS.row,
                                )}
                            >
                                <TableCell
                                    className={cn(
                                        'p-0',
                                        isCards && PHONE_CARD_CLASS.plainCell,
                                    )}
                                    colSpan={colCount}
                                    style={
                                        reservedRows > 0
                                            ? {
                                                  height: `${String(reservedRows * DATA_TABLE_ROW_HEIGHT_REM)}rem`,
                                              }
                                            : undefined
                                    }
                                >
                                    {renderDataTableSlot(emptyState, table) ?? (
                                        <EmptyState title={emptyMessage} />
                                    )}
                                </TableCell>
                            </TableRow>
                        ) : (
                            pageRows.map((row, index) => {
                                const groupHeading = rowGroupHeading?.(
                                    row.original,
                                );
                                if (
                                    groupHeading !== undefined &&
                                    groupHeading !== null
                                ) {
                                    return (
                                        <TableRow
                                            className={cn(
                                                'border-t bg-muted/30 hover:bg-muted/30',
                                                isCards &&
                                                    PHONE_CARD_CLASS.fullRow,
                                            )}
                                            key={row.id}
                                        >
                                            <TableGroupHeader
                                                className={
                                                    isCards
                                                        ? PHONE_CARD_CLASS.fullRowCell
                                                        : undefined
                                                }
                                                colSpan={colCount}
                                            >
                                                {groupHeading}
                                            </TableGroupHeader>
                                        </TableRow>
                                    );
                                }
                                const delay = `${Math.min(index, 12) * 35}ms`;
                                const message = rowMessage?.(row.original);
                                const cells = row.getVisibleCells();
                                const shownCells =
                                    message === undefined || message === null
                                        ? cells
                                        : cells.slice(0, 1);
                                return (
                                    <Fragment key={row.id}>
                                        <TableRow
                                            className={cn(
                                                'animate-in duration-500 fade-in-0 fill-mode-both',
                                                isCards && PHONE_CARD_CLASS.row,
                                                rowClassName?.(row.original),
                                            )}
                                            data-state={
                                                row.getIsSelected()
                                                    ? 'selected'
                                                    : undefined
                                            }
                                            style={{ animationDelay: delay }}
                                        >
                                            {shownCells.map((cell) => {
                                                const meta =
                                                    cell.column.columnDef.meta;
                                                const align = meta?.align;
                                                const CellTag =
                                                    meta?.isRowHeader === true
                                                        ? TableRowHeader
                                                        : TableCell;
                                                const phoneLabel = isCards
                                                    ? phoneLabelOf(
                                                          cell.column.columnDef,
                                                      )
                                                    : undefined;
                                                return (
                                                    <CellTag
                                                        className={cn(
                                                            align &&
                                                                DATA_TABLE_ALIGN_CLASS_NAME[
                                                                    align
                                                                ],
                                                            isCards &&
                                                                phoneCellClassOf(
                                                                    cell.column
                                                                        .columnDef,
                                                                    phoneLabel,
                                                                ),
                                                        )}
                                                        data-label={phoneLabel}
                                                        key={cell.id}
                                                    >
                                                        <div
                                                            className="animate-in duration-500 fade-in-0 fill-mode-both slide-in-from-bottom-1"
                                                            style={{
                                                                animationDelay:
                                                                    delay,
                                                            }}
                                                        >
                                                            <DataTableCellContent
                                                                context={cell.getContext()}
                                                                render={
                                                                    cell.column
                                                                        .columnDef
                                                                        .cell
                                                                }
                                                            />
                                                        </div>
                                                    </CellTag>
                                                );
                                            })}
                                            {shownCells.length <
                                                cells.length && (
                                                <TableCell
                                                    className={
                                                        isCards
                                                            ? PHONE_CARD_CLASS.plainCell
                                                            : undefined
                                                    }
                                                    colSpan={
                                                        cells.length -
                                                        shownCells.length
                                                    }
                                                >
                                                    {message}
                                                </TableCell>
                                            )}
                                        </TableRow>
                                        {renderExpanded &&
                                            row.getIsExpanded() && (
                                                <TableRow
                                                    className={cn(
                                                        'hover:bg-transparent',
                                                        isCards &&
                                                            PHONE_CARD_CLASS.fullRow,
                                                    )}
                                                >
                                                    <TableCell
                                                        className={cn(
                                                            'p-0',
                                                            isCards &&
                                                                PHONE_CARD_CLASS.fullRowCell,
                                                        )}
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
                        {pageRows.length > 0 &&
                            Array.from({ length: fillerRows }, (_, index) => (
                                <TableRow
                                    aria-hidden
                                    className={cn(
                                        'h-9 border-transparent hover:bg-transparent',
                                        isCards && PHONE_CARD_CLASS.hidden,
                                    )}
                                    key={`filler-${String(index)}`}
                                >
                                    <TableCell colSpan={colCount} />
                                </TableRow>
                            ))}
                    </TableBody>
                </Table>
            </div>
            {serverPagination ? (
                <DataTableServerPaginationControls
                    pagination={serverPagination}
                    rowCount={data.length}
                />
            ) : (
                hasClientPages && <DataTableClientPagination table={table} />
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
                    className="flex size-6 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
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

function DataTableCellContent<TContext>({
    context,
    render,
}: {
    readonly context: TContext;
    readonly render:
        ((context: TContext) => React.ReactNode) | React.ReactNode | undefined;
}) {
    return typeof render === 'function' ? render(context) : render;
}

function phoneCellClassOf<TData extends RowData>(
    column: DataTableColumn<TData>,
    label: string | undefined,
): string {
    const { meta } = column;
    if (meta?.isPhoneHidden === true) return PHONE_CARD_CLASS.hidden;
    if (meta?.isRowActions === true) return PHONE_CARD_CLASS.actionsCell;
    if (meta?.isRowHeader === true) return PHONE_CARD_CLASS.rowHeaderCell;
    return label === undefined
        ? PHONE_CARD_CLASS.plainCell
        : PHONE_CARD_CLASS.labelledCell;
}

function phoneLabelOf<TData extends RowData>(
    column: DataTableColumn<TData>,
): string | undefined {
    const { meta } = column;
    if (meta?.isRowHeader === true || meta?.isRowActions === true) {
        return undefined;
    }
    const label =
        meta?.label ??
        (typeof column.header === 'string' ? column.header : undefined);
    return label === '' ? undefined : label;
}

function renderDataTableSlot<TData extends RowData>(
    slot: DataTableSlot<TData> | undefined,
    table: ReactTable<typeof dataTableFeatures, TData>,
): React.ReactNode {
    return typeof slot === 'function' ? slot(table) : slot;
}
