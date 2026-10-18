import { DataTable, DataTableAlign } from '~/components/ui/data-table';
import { formatDisplayMonth } from '~/lib/format';

import { type PurchaseCohortRow } from './overviewModel';

enum PurchaseCohortsViewColumn {
    InProgress = 'in-progress',
    Payouts = 'payouts',
    PurchaseMonth = 'purchase-month',
    RealizedMultipleEnded = 'realized-multiple-ended',
    Spend = 'spend',
    ToDateMultiple = 'to-date-multiple',
}

export function PurchaseCohortsView({
    rows,
}: {
    readonly rows: readonly PurchaseCohortRow[];
}) {
    if (rows.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                No purchase recorded yet.
            </p>
        );
    }
    return (
        <DataTable
            columns={[
                {
                    cell: ({ row }) => (
                        <span className="tabular-nums">
                            {formatDisplayMonth(row.original.month)}
                        </span>
                    ),
                    header: 'Purchase month',
                    id: PurchaseCohortsViewColumn.PurchaseMonth,
                    meta: { isRowHeader: true },
                },
                {
                    cell: ({ row }) => <>{row.original.spend}</>,
                    header: 'Spend',
                    id: PurchaseCohortsViewColumn.Spend,
                    meta: { align: DataTableAlign.End },
                },
                {
                    cell: ({ row }) => <>{row.original.payouts}</>,
                    header: 'Payouts',
                    id: PurchaseCohortsViewColumn.Payouts,
                    meta: { align: DataTableAlign.End },
                },
                {
                    cell: ({ row }) => <>{row.original.realizedMultiple}</>,
                    header: 'Realized multiple (ended)',
                    id: PurchaseCohortsViewColumn.RealizedMultipleEnded,
                    meta: { align: DataTableAlign.End },
                },
                {
                    cell: ({ row }) => <>{row.original.toDateMultiple}</>,
                    header: 'To-date multiple',
                    id: PurchaseCohortsViewColumn.ToDateMultiple,
                    meta: { align: DataTableAlign.End },
                },
                {
                    cell: ({ row }) => <>{row.original.inProgressCount}</>,
                    header: 'In progress',
                    id: PurchaseCohortsViewColumn.InProgress,
                    meta: { align: DataTableAlign.End },
                },
            ]}
            data={[...rows]}
            isSortable={false}
            pageSize={null}
            rowId={(row) => row.key}
        />
    );
}
