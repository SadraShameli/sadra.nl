import { PieChart } from 'lucide-react';
import { memo } from 'react';

import { FigureText } from '~/app/(app)/prop-calculator/accounts/_components/FigureText';
import { PanelSubheading } from '~/components/PanelSubheading';
import { DataTable, DataTableAlign } from '~/components/ui/data-table';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';

import {
    type DiversificationCardModel,
    type FirmShareRow,
} from './overviewModel';
import { OverviewEmptyPanel, OverviewPanel } from './OverviewPanel';
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
    if (model.funding.length === 0 && model.payouts.length === 0) {
        return (
            <OverviewEmptyPanel
                description="Shares by firm appear once an account is funded or a payout is paid."
                icon={PieChart}
                section={OverviewSectionId.Diversification}
                title="Nothing to diversify yet"
            />
        );
    }
    return (
        <OverviewPanel
            contentClassName="grid gap-6 lg:grid-cols-2"
            section={OverviewSectionId.Diversification}
        >
            <ShareTable
                emptyTitle="No active funded or live account yet"
                rows={model.funding}
                title="Funding (active funded and live nominal)"
            />
            <ShareTable
                emptyTitle="No paid payout yet"
                rows={model.payouts}
                title="Payouts received"
            />
        </OverviewPanel>
    );
});

function ShareTable({
    emptyTitle,
    rows,
    title,
}: {
    readonly emptyTitle: string;
    readonly rows: readonly FirmShareRow[];
    readonly title: string;
}) {
    return (
        <div className="flex flex-col gap-2">
            <PanelSubheading>{title}</PanelSubheading>
            {rows.length === 0 ? (
                <EmptyState size={EmptyStateSize.Compact} title={emptyTitle} />
            ) : (
                <DataTable
                    columns={[
                        {
                            cell: ({ row }) => (
                                <FigureText text={row.original.firm} />
                            ),
                            header: 'Firm',
                            id: DiversificationCardColumn.Firm,
                            meta: { isRowHeader: true },
                        },
                        {
                            cell: ({ row }) => (
                                <FigureText text={row.original.amount} />
                            ),
                            header: 'Amount',
                            id: DiversificationCardColumn.Amount,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <FigureText text={row.original.share} />
                            ),
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
