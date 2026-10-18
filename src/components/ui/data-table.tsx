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
import { Fragment, useRef, useState } from 'react';

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
    DataTableNarrowLayout,
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
import { useIsTableOverflowing } from '~/components/ui/use-table-overflow';
import { cn } from '~/lib/utilities';

export const DATA_TABLE_PAGE_SIZE = 25;

export {
    DataTableAlign,
    type DataTableColumn,
    type DataTableColumnMeta,
    type DataTableCore,
    DataTableFilterFunction,
    type DataTableInstance,
    DataTableNarrowLayout,
    type DataTableRow,
    type DataTableServerPagination,
    type DataTableSlot,
    DataTableSortFunction,
    hasActiveTableFilter,
} from '~/components/ui/data-table.features';

const DATA_TABLE_ROW_HEIGHT_REM = 2.25;

const SHOW_DETAILS_LABEL = 'Show details';

const HIDE_DETAILS_LABEL = 'Hide details';

const CURRENT_ROW_CLASS =
    'data-[current=true]:bg-primary/10 data-[current=true]:font-semibold data-[current=true]:text-foreground';

const CARD_LAYOUT_CLASS = {
    actionsCell:
        'table-cards:absolute table-cards:top-3 table-cards:right-3 table-cards:p-0',
    body: 'table-cards:flex table-cards:flex-col table-cards:gap-3 table-cards:[&_tr:last-child]:border',
    container: 'table-cards:overflow-visible',
    fullRow:
        'table-cards:block table-cards:border-0 table-cards:bg-transparent',
    fullRowCell: 'table-cards:block table-cards:px-0',
    header: 'table-cards:hidden',
    hidden: 'table-cards:hidden',
    labelledCell:
        'table-cards:flex table-cards:flex-wrap table-cards:items-baseline table-cards:justify-between table-cards:gap-x-4 table-cards:gap-y-0.5 table-cards:p-0 table-cards:text-right table-cards:break-words table-cards:[&>*]:ml-auto table-cards:[&>*]:max-w-full table-cards:[&>*]:min-w-0 table-cards:before:max-w-full table-cards:before:text-left table-cards:before:type-micro table-cards:before:text-ink-muted table-cards:before:content-[attr(data-label)]',
    plainCell:
        'table-cards:block table-cards:min-w-0 table-cards:p-0 table-cards:text-left table-cards:break-words',
    row: 'table-cards:relative table-cards:flex table-cards:flex-col table-cards:gap-2 table-cards:rounded-lg table-cards:border table-cards:border-line table-cards:p-4 table-cards:not-data-[current=true]:bg-card',
    rowHeaderCell:
        'table-cards:order-first table-cards:block table-cards:p-0 table-cards:pr-10 table-cards:text-left table-cards:font-medium table-cards:text-ink',
    table: 'table-cards:block table-cards:min-w-0 table-cards:whitespace-normal',
    wrapper:
        'table-cards:overflow-visible table-cards:rounded-none table-cards:border-0 table-cards:bg-transparent',
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
    isCurrentRow?: (row: TData) => boolean;
    isLoading?: boolean;
    isSortable?: boolean;
    labelledBy?: string;
    narrowLayout?: DataTableNarrowLayout;
    onResetFilters?: () => void;
    onRowSelectionChange?: (rows: TData[]) => void;
    onSortingChange?: (sorting: SortingState) => void;
    pageSize?: null | number;
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
    isCurrentRow,
    isLoading,
    isSortable = true,
    labelledBy,
    narrowLayout = DataTableNarrowLayout.Cards,
    onResetFilters,
    onRowSelectionChange,
    onSortingChange,
    pageSize = DATA_TABLE_PAGE_SIZE,
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

    const isCards = narrowLayout === DataTableNarrowLayout.Cards;
    const rootReference = useRef<HTMLDivElement>(null);
    const frameReference = useRef<HTMLDivElement>(null);
    const tableReference = useRef<HTMLTableElement>(null);
    const isOverflowing = useIsTableOverflowing(
        { frameReference, rootReference, tableReference },
        isCards,
    );
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
        <div
            className={cn('flex w-full min-w-0 flex-col gap-3', className)}
            data-table-cards={isCards && isOverflowing ? true : undefined}
            ref={rootReference}
        >
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
                    isCards && CARD_LAYOUT_CLASS.wrapper,
                )}
                ref={frameReference}
            >
                <Table
                    aria-label={ariaLabel}
                    aria-labelledby={labelledBy}
                    className={cn(
                        'min-w-max whitespace-nowrap',
                        isCards && CARD_LAYOUT_CLASS.table,
                        tableClassName,
                    )}
                    containerClassName={
                        isCards ? CARD_LAYOUT_CLASS.container : undefined
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
                    ref={tableReference}
                >
                    {caption === undefined ? null : (
                        <TableCaption className="sr-only">
                            {caption}
                        </TableCaption>
                    )}
                    <TableHeader
                        className={
                            isCards ? CARD_LAYOUT_CLASS.header : undefined
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
                        className={isCards ? CARD_LAYOUT_CLASS.body : undefined}
                        key={isLoading ? 'skeleton' : 'data'}
                    >
                        {isLoading ? (
                            Array.from({ length: skeletonRows }, (_, index) => (
                                <TableRow
                                    className={cn(
                                        'animate-in duration-500 fade-in-0 fill-mode-both',
                                        isCards && CARD_LAYOUT_CLASS.row,
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
                                                        ? CARD_LAYOUT_CLASS.plainCell
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
                                    isCards && CARD_LAYOUT_CLASS.row,
                                )}
                            >
                                <TableCell
                                    className={cn(
                                        'p-0',
                                        isCards && CARD_LAYOUT_CLASS.plainCell,
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
                                                    CARD_LAYOUT_CLASS.fullRow,
                                            )}
                                            key={row.id}
                                        >
                                            <TableGroupHeader
                                                className={
                                                    isCards
                                                        ? CARD_LAYOUT_CLASS.fullRowCell
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
                                const isCurrent =
                                    isCurrentRow?.(row.original) === true;
                                return (
                                    <Fragment key={row.id}>
                                        <TableRow
                                            aria-current={
                                                isCurrent ? 'true' : undefined
                                            }
                                            className={cn(
                                                'animate-in duration-500 fade-in-0 fill-mode-both',
                                                CURRENT_ROW_CLASS,
                                                isCards &&
                                                    CARD_LAYOUT_CLASS.row,
                                                rowClassName?.(row.original),
                                            )}
                                            data-current={
                                                isCurrent ? true : undefined
                                            }
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
                                                                cardCellClassOf(
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
                                                            ? CARD_LAYOUT_CLASS.plainCell
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
                                                            CARD_LAYOUT_CLASS.fullRow,
                                                    )}
                                                >
                                                    <TableCell
                                                        className={cn(
                                                            'p-0',
                                                            isCards &&
                                                                CARD_LAYOUT_CLASS.fullRowCell,
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
                                        isCards && CARD_LAYOUT_CLASS.hidden,
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
                    pagination={
                        hasActiveTableFilter(table)
                            ? { ...serverPagination, totalCount: undefined }
                            : serverPagination
                    }
                    rowCount={table.getRowModel().rows.length}
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
                    aria-expanded={row.getIsExpanded()}
                    aria-label={
                        row.getIsExpanded()
                            ? HIDE_DETAILS_LABEL
                            : SHOW_DETAILS_LABEL
                    }
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

function cardCellClassOf<TData extends RowData>(
    column: DataTableColumn<TData>,
    label: string | undefined,
): string {
    const { meta } = column;
    if (meta?.isHiddenInCards === true) return CARD_LAYOUT_CLASS.hidden;
    if (meta?.isRowActions === true) return CARD_LAYOUT_CLASS.actionsCell;
    if (meta?.isRowHeader === true) return CARD_LAYOUT_CLASS.rowHeaderCell;
    return label === undefined
        ? CARD_LAYOUT_CLASS.plainCell
        : CARD_LAYOUT_CLASS.labelledCell;
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
