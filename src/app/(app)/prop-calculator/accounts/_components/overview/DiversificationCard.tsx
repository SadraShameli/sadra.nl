import { memo } from 'react';

import { PanelSubheading } from '~/components/PanelSubheading';
import { DataTable, DataTableAlign } from '~/components/ui/data-table';

import {
    type DiversificationCardModel,
    type FirmShareRow,
} from './overviewModel';
import { OverviewPanel } from './OverviewPanel';
import { OverviewSectionId } from './overviewSections';

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
        <OverviewPanel
            contentClassName="grid gap-6 lg:grid-cols-2"
            section={OverviewSectionId.Diversification}
        >
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
        </OverviewPanel>
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
            <PanelSubheading>{title}</PanelSubheading>
            {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">{emptyMessage}</p>
            ) : (
                <DataTable
                    columns={[
                        {
                            cell: ({ row }) => <>{row.original.firm}</>,
                            header: 'Firm',
                            id: DiversificationCardColumn.Firm,
                            meta: { isRowHeader: true },
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
