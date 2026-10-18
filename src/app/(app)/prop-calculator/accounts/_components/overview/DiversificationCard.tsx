import { memo } from 'react';

import { DataTable, DataTableAlign } from '~/components/ui/data-table';

import {
    type DiversificationCardModel,
    type FirmShareRow,
} from './overviewModel';

enum DiversificationCardColumn {
    Amount = 'amount',
    Firm = 'firm',
    Share = 'share',
}

export const DiversificationCard = memo(function DiversificationCard({
    model,
}: {
    readonly model: DiversificationCardModel;
}) {
    return (
        <div className="grid gap-6 lg:grid-cols-2">
            <ShareTable
                emptyMessage="No active funded or live account yet."
                rows={model.funding}
                title="Funding (active funded and live nominal)"
            />
            <ShareTable
                emptyMessage="No paid payout yet."
                rows={model.payouts}
                title="Payouts received"
            />
        </div>
    );
});

function ShareTable({
    emptyMessage,
    rows,
    title,
}: {
    readonly emptyMessage: string;
    readonly rows: readonly FirmShareRow[];
    readonly title: string;
}) {
    return (
        <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-foreground">{title}</h3>
            {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">{emptyMessage}</p>
            ) : (
                <DataTable
                    columns={[
                        {
                            cell: ({ row }) => <>{row.original.firm}</>,
                            header: 'Firm',
                            id: DiversificationCardColumn.Firm,
                        },
                        {
                            cell: ({ row }) => <>{row.original.amount}</>,
                            header: 'Amount',
                            id: DiversificationCardColumn.Amount,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => <>{row.original.share}</>,
                            header: 'Share',
                            id: DiversificationCardColumn.Share,
                            meta: { align: DataTableAlign.End },
                        },
                    ]}
                    data={[...rows]}
                    isSortable={false}
                    pageSize={null}
                    rowId={(row) => row.key}
                />
            )}
        </div>
    );
}
