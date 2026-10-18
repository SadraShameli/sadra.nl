'use client';

import { type ReactTable, type RowData } from '@tanstack/react-table';

import { Button } from '~/components/ui/button';
import {
    type dataTableFeatures,
    type DataTableServerPagination,
} from '~/components/ui/data-table.features';
import { formatCount } from '~/lib/format';

const NO_RESULTS_LABEL = 'No results';

export function DataTableClientPagination<TData extends RowData>({
    table,
}: {
    table: ReactTable<typeof dataTableFeatures, TData>;
}) {
    const { pageIndex, pageSize } = table.state.pagination;
    const total = table.getRowCount();
    const first = pageIndex * pageSize + 1;
    return (
        <DataTablePaginationFooter
            canNext={table.getCanNextPage()}
            canPrevious={table.getCanPreviousPage()}
            label={pageRangeLabel(
                first,
                Math.min(total, first + pageSize - 1),
                total,
            )}
            onNext={() => table.nextPage()}
            onPrevious={() => table.previousPage()}
        />
    );
}

export function DataTableServerPaginationControls({
    pagination,
    rowCount,
}: {
    pagination: DataTableServerPagination;
    rowCount: number;
}) {
    const {
        hasNextPage,
        isPending = false,
        onPageIndexChange,
        pageIndex,
        pageSize,
        totalCount,
    } = pagination;
    const offset = pageIndex * pageSize;
    return (
        <DataTablePaginationFooter
            canNext={hasNextPage && !isPending}
            canPrevious={pageIndex > 0 && !isPending}
            label={pageRangeLabel(offset + 1, offset + rowCount, totalCount)}
            onNext={() => onPageIndexChange(pageIndex + 1)}
            onPrevious={() => onPageIndexChange(Math.max(0, pageIndex - 1))}
        />
    );
}

function DataTablePaginationFooter({
    canNext,
    canPrevious,
    label,
    onNext,
    onPrevious,
}: {
    readonly canNext: boolean;
    readonly canPrevious: boolean;
    readonly label: string;
    readonly onNext: () => void;
    readonly onPrevious: () => void;
}) {
    return (
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span className="tabular-nums">{label}</span>
            <div className="flex gap-2">
                <Button
                    disabled={!canPrevious}
                    onClick={onPrevious}
                    size="sm"
                    variant="outline"
                >
                    Previous
                </Button>
                <Button
                    disabled={!canNext}
                    onClick={onNext}
                    size="sm"
                    variant="outline"
                >
                    Next
                </Button>
            </div>
        </div>
    );
}

function pageRangeLabel(first: number, last: number, total?: number): string {
    if (last < first) return NO_RESULTS_LABEL;
    const range = `${formatCount(first)} to ${formatCount(last)}`;
    return total === undefined ? range : `${range} of ${formatCount(total)}`;
}
