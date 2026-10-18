import { prKindLabel } from '~/app/(app)/lifting/_components/shared/prKindLabel';
import { Badge } from '~/components/ui/badge';
import {
    DataTableAlign,
    type DataTableColumn,
} from '~/components/ui/data-table';
import { formatDisplayDate } from '~/lib/format';
import { WeightUnit } from '~/lib/lifting/format';
import { type UnitWeight } from '~/lib/lifting/types';
import { type RouterOutputs } from '~/trpc/react';

type PrTableRow = RouterOutputs['lifting']['analytics']['prTimeline'][number];

export function prTableColumns(
    unitWeight: UnitWeight,
): DataTableColumn<PrTableRow>[] {
    return [
        {
            accessorKey: 'kind',
            cell: ({ row }) => <Badge>{prKindLabel(row.original.kind)}</Badge>,
            header: 'Kind',
        },
        {
            cell: ({ row }) => (
                <span className="font-semibold tabular-nums">
                    {WeightUnit.format(row.original.weightKg, unitWeight)} ×{' '}
                    {row.original.reps}
                </span>
            ),
            header: 'Lift',
            id: 'lift',
            meta: { align: DataTableAlign.End, isRowHeader: true },
        },
        {
            accessorKey: 'achievedAt',
            cell: ({ row }) => (
                <span className="text-muted-foreground tabular-nums">
                    {formatDisplayDate(row.original.achievedAt)}
                </span>
            ),
            header: 'Date',
            meta: { align: DataTableAlign.End },
        },
    ];
}
