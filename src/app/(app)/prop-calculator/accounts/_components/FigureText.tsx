import { type RowData } from '@tanstack/react-table';
import { type ReactNode } from 'react';

import { MissingValue } from '~/components/MissingValue';
import {
    type DataTableAlign,
    type DataTableColumn,
} from '~/components/ui/data-table';
import { Skeleton } from '~/components/ui/skeleton';

import { hasFigure, isMissingFigure, isPendingFigure } from './figureValues';

export interface FigureColumn<Row extends RowData> {
    readonly align?: DataTableAlign;
    readonly className?: string;
    readonly header: string;
    readonly id: string;
    readonly isRowHeader?: boolean;
    readonly reasonOf?: (row: Row) => ReactNode;
    readonly textOf: (row: Row) => string;
}

const COMPUTING_TEXT = 'Computing';

export function ComputingFigure() {
    return (
        <span className="inline-flex">
            <Skeleton aria-hidden className="h-4 w-16" />
            <span className="sr-only">{COMPUTING_TEXT}</span>
        </span>
    );
}

export function figureColumns<Row extends RowData>(
    columns: readonly FigureColumn<Row>[],
    rows: readonly Row[],
): DataTableColumn<Row>[] {
    return columns
        .filter((column) =>
            rows.some(
                (row) =>
                    hasFigure(column.textOf(row)) ||
                    (column.reasonOf?.(row) ?? null) !== null,
            ),
        )
        .map((column) => ({
            cell: ({ row }) => (
                <FigureText
                    className={column.className}
                    reason={column.reasonOf?.(row.original)}
                    text={column.textOf(row.original)}
                />
            ),
            header: column.header,
            id: column.id,
            meta: {
                align: column.align,
                isRowHeader: column.isRowHeader,
            },
        }));
}

export function FigureText({
    className,
    reason,
    text,
}: {
    readonly className?: string;
    readonly reason?: ReactNode;
    readonly text: string;
}) {
    if (isMissingFigure(text)) return <MissingValue reason={reason} />;
    if (isPendingFigure(text)) return <ComputingFigure />;
    return text === '' ? null : <span className={className}>{text}</span>;
}
