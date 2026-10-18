import { Layers } from 'lucide-react';
import { memo } from 'react';

import { figureColumns } from '~/app/(app)/prop-calculator/accounts/_components/FigureText';
import { DataTable, DataTableAlign } from '~/components/ui/data-table';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';

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
                <EmptyState
                    icon={Layers}
                    size={EmptyStateSize.Compact}
                    title="No plan in use yet"
                />
            ) : (
                <DataTable
                    columns={figureColumns(
                        [
                            {
                                header: 'Plan',
                                id: CapUsageCardColumn.Plan,
                                isRowHeader: true,
                                textOf: (row) => row.plan,
                            },
                            {
                                align: DataTableAlign.End,
                                header: 'Funded in use',
                                id: CapUsageCardColumn.FundedInUse,
                                textOf: (row) => row.used,
                            },
                            {
                                align: DataTableAlign.End,
                                header: 'Cap',
                                id: CapUsageCardColumn.Cap,
                                textOf: (row) => row.cap,
                            },
                            {
                                align: DataTableAlign.End,
                                header: 'Free slots',
                                id: CapUsageCardColumn.FreeSlots,
                                textOf: (row) => row.freeSlots,
                            },
                            {
                                header: 'Note',
                                id: CapUsageCardColumn.Note,
                                textOf: (row) => row.note ?? '',
                            },
                        ],
                        model.rows,
                    )}
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
