import { memo } from 'react';

import { DataTable, DataTableAlign } from '~/components/ui/data-table';

import { type CapUsageCardModel } from './overviewModel';

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
        <div className="flex flex-col gap-3">
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
            <p className="text-xs text-muted-foreground">{model.disclosure}</p>
            {model.unresolvedNote !== null && (
                <p className="text-xs text-muted-foreground">
                    {model.unresolvedNote}
                </p>
            )}
        </div>
    );
});
