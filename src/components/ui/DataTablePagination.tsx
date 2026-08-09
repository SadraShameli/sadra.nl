'use client';

import { type ReactTable, type RowData } from '@tanstack/react-table';

import { Button } from '~/components/ui/Button';
import {
    type dataTableFeatures,
    type DataTableServerPagination,
} from '~/components/ui/DataTable.features';

export function DataTableClientPagination<TData extends RowData>({
    table,
}: {
    table: ReactTable<typeof dataTableFeatures, TData>;
}) {
    const pageIndex = table.state.pagination.pageIndex;
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

export function DataTableServerPaginationControls({
    pagination,
    rowCount,
}: {
    pagination: DataTableServerPagination;
    rowCount: number;
}) {
    const { hasNextPage, isPending, onPageIndexChange, pageIndex, pageSize } =
        pagination;
    const offset = pageIndex * pageSize;
    return (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
                {rowCount > 0
                    ? `${offset + 1}–${offset + rowCount}`
                    : '0 results'}
            </span>
            <div className="flex gap-2">
                <Button
                    disabled={pageIndex === 0 || isPending}
                    onClick={() =>
                        onPageIndexChange(Math.max(0, pageIndex - 1))
                    }
                    size="sm"
                    variant="outline"
                >
                    Previous
                </Button>
                <Button
                    disabled={!hasNextPage || isPending}
                    onClick={() => onPageIndexChange(pageIndex + 1)}
                    size="sm"
                    variant="outline"
                >
                    Next
                </Button>
            </div>
        </div>
    );
}
