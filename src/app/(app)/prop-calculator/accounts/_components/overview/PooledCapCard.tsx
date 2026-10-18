import { memo } from 'react';

import { DataTable, DataTableAlign } from '~/components/ui/data-table';

import { type PooledCapCardModel } from './overviewModel';

enum PooledCapCardColumn {
    CapScope = 'cap-scope',
    FreeSlots = 'free-slots',
    FundedInUse = 'funded-in-use',
    Note = 'note',
    Plan = 'plan',
    PlanCap = 'plan-cap',
    PoolFreeSlots = 'pool-free-slots',
}

export const PooledCapCard = memo(function PooledCapCard({
    model,
}: {
    readonly model: PooledCapCardModel;
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
                            id: PooledCapCardColumn.Plan,
                        },
                        {
                            cell: ({ row }) => <>{row.original.scope}</>,
                            header: 'Cap scope',
                            id: PooledCapCardColumn.CapScope,
                        },
                        {
                            cell: ({ row }) => <>{row.original.used}</>,
                            header: 'Funded in use',
                            id: PooledCapCardColumn.FundedInUse,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => <>{row.original.cap}</>,
                            header: 'Plan cap',
                            id: PooledCapCardColumn.PlanCap,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <>{row.original.poolFreeSlots}</>
                            ),
                            header: 'Pool free slots',
                            id: PooledCapCardColumn.PoolFreeSlots,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => <>{row.original.freeSlots}</>,
                            header: 'Free slots',
                            id: PooledCapCardColumn.FreeSlots,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => <>{row.original.note}</>,
                            header: 'Note',
                            id: PooledCapCardColumn.Note,
                        },
                    ]}
                    data={[...model.rows]}
                    isSortable={false}
                    pageSize={null}
                    rowId={(row) => row.key}
                />
            )}
            <p className="text-xs text-muted-foreground">{model.disclosure}</p>
            <p className="text-xs text-muted-foreground">
                {model.countingNote}
            </p>
            {model.unverifiedFirms.length > 0 && (
                <ul
                    aria-label="Firms with an unverified cap scope"
                    className="flex list-disc flex-col gap-1 pl-5 text-xs text-muted-foreground"
                >
                    {model.unverifiedFirms.map((firm) => (
                        <li key={firm}>{firm}: cap scope unverified</li>
                    ))}
                </ul>
            )}
            {model.householdNote !== null && (
                <p className="text-xs text-muted-foreground">
                    {model.householdNote}
                </p>
            )}
        </div>
    );
});
