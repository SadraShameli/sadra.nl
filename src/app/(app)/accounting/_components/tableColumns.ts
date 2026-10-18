import { type RowData } from '@tanstack/react-table';

import { type DataTableColumn } from '~/components/ui/data-table';

export function columnWhenAnyRow<TRow extends RowData>(
    rows: readonly TRow[],
    hasValue: (row: TRow) => boolean,
    column: DataTableColumn<TRow>,
): DataTableColumn<TRow>[] {
    return rows.some(hasValue) ? [column] : [];
}
