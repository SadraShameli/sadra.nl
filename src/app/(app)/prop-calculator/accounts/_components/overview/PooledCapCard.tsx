import { Layers } from 'lucide-react';
import { memo } from 'react';

import { figureColumns } from '~/app/(app)/prop-calculator/accounts/_components/FigureText';
import { DataTable, DataTableAlign } from '~/components/ui/data-table';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';

import { type PooledCapCardModel } from './overviewModel';
import { InfoStack, OverviewPanel } from './OverviewPanel';
import { OverviewSectionId } from './overviewSections';

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
        <OverviewPanel
            info={
                <InfoStack>
                    <p>{model.disclosure}</p>
                    <p>{model.countingNote}</p>
                    {model.householdNote !== null && (
                        <p>{model.householdNote}</p>
                    )}
                </InfoStack>
            }
            section={OverviewSectionId.PooledCaps}
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
                                id: PooledCapCardColumn.Plan,
                                isRowHeader: true,
                                textOf: (row) => row.plan,
                            },
                            {
                                header: 'Cap scope',
                                id: PooledCapCardColumn.CapScope,
                                textOf: (row) => row.scope,
                            },
                            {
                                align: DataTableAlign.End,
                                header: 'Funded in use',
                                id: PooledCapCardColumn.FundedInUse,
                                textOf: (row) => row.used,
                            },
                            {
                                align: DataTableAlign.End,
                                header: 'Plan cap',
                                id: PooledCapCardColumn.PlanCap,
                                textOf: (row) => row.cap,
                            },
                            {
                                align: DataTableAlign.End,
                                header: 'Pool free slots',
                                id: PooledCapCardColumn.PoolFreeSlots,
                                textOf: (row) => row.poolFreeSlots,
                            },
                            {
                                align: DataTableAlign.End,
                                header: 'Free slots',
                                id: PooledCapCardColumn.FreeSlots,
                                textOf: (row) => row.freeSlots,
                            },
                            {
                                header: 'Note',
                                id: PooledCapCardColumn.Note,
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
        </OverviewPanel>
    );
});
