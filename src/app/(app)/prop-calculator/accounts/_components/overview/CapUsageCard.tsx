import { memo } from 'react';

import { DataTable, DataTableAlign } from '~/components/ui/data-table';

import { type CapUsageCardModel } from './overviewModel';
import { OverviewPanel } from './OverviewPanel';
import { OverviewSectionId } from './overviewSections';

enum CapUsageCardColumn {
    Cap = 'cap',
    FreeSlots = 'free-slots',
    FundedInUse = 'funded-in-use',
    Note = 'note',
    Plan = 'plan',
}

export const CapUsageCard = memo(function CapUsageCard({
    model,
}: {
    readonly model: CapUsageCardModel;
}) {
    return (
        <OverviewPanel
            info={model.disclosure}
            section={OverviewSectionId.CapUsage}
        >
            {model.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No plan in use yet.
                </p>
            ) : (
                <DataTable
                    columns={[
                        {
                            cell: ({ row }) => <>{row.original.plan}</>,
                            header: 'Plan',
                            id: CapUsageCardColumn.Plan,
                            meta: { isRowHeader: true },
                        },
                        {
                            cell: ({ row }) => <>{row.original.used}</>,
                            header: 'Funded in use',
                            id: CapUsageCardColumn.FundedInUse,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => <>{row.original.cap}</>,
                            header: 'Cap',
                            id: CapUsageCardColumn.Cap,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => <>{row.original.freeSlots}</>,
                            header: 'Free slots',
                            id: CapUsageCardColumn.FreeSlots,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => <>{row.original.note}</>,
                            header: 'Note',
                            id: CapUsageCardColumn.Note,
                        },
                    ]}
                    data={[...model.rows]}
                    isSortable={false}
                    pageSize={null}
                    rowId={(row) => row.key}
                />
            )}
            {model.unresolvedNote !== null && (
                <p className="text-xs text-muted-foreground">
                    {model.unresolvedNote}
                </p>
            )}
        </OverviewPanel>
    );
});
