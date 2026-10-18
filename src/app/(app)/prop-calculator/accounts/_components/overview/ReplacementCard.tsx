import { RefreshCw } from 'lucide-react';
import { memo } from 'react';

import { FigureText } from '~/app/(app)/prop-calculator/accounts/_components/FigureText';
import { DataTable, DataTableAlign } from '~/components/ui/data-table';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';

import { type ReplacementCardModel } from './overviewModel';
import { OverviewPanel } from './OverviewPanel';
import { OverviewSectionId } from './overviewSections';
import { SampleBadge } from './SampleBadge';

enum ReplacementCardColumn {
    Attempts = 'attempts',
    AttemptsPerFunded = 'attempts-per-funded',
    Plan = 'plan',
    RebuyLag = 'rebuy-lag',
    RebuyLagUsedByDefault = 'rebuy-lag-used-by-default',
    ReplacementsNotMeasured = 'replacements-not-measured',
}

export const ReplacementCard = memo(function ReplacementCard({
    model,
}: {
    readonly model: ReplacementCardModel;
}) {
    return (
        <OverviewPanel section={OverviewSectionId.Replacement}>
            {model.rows.length === 0 ? (
                <EmptyState
                    icon={RefreshCw}
                    size={EmptyStateSize.Compact}
                    title="No account with a modeled plan yet"
                />
            ) : (
                <DataTable
                    columns={[
                        {
                            cell: ({ row }) => (
                                <FigureText text={row.original.plan} />
                            ),
                            header: 'Plan',
                            id: ReplacementCardColumn.Plan,
                            meta: { isRowHeader: true },
                        },
                        {
                            cell: ({ row }) => (
                                <>
                                    <span className="inline-flex items-center gap-1.5">
                                        {row.original.attempts}
                                        <SampleBadge
                                            level={
                                                row.original.attemptsSampleLevel
                                            }
                                        />
                                    </span>
                                </>
                            ),
                            header: 'Attempts',
                            id: ReplacementCardColumn.Attempts,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <FigureText
                                    text={row.original.attemptsPerFunded}
                                />
                            ),
                            header: 'Attempts per funded',
                            id: ReplacementCardColumn.AttemptsPerFunded,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <FigureText text={row.original.lag} />
                            ),
                            header: 'Rebuy lag',
                            id: ReplacementCardColumn.RebuyLag,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <FigureText text={row.original.rebuyLag} />
                            ),
                            header: 'Rebuy lag used by default',
                            id: ReplacementCardColumn.RebuyLagUsedByDefault,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <FigureText text={row.original.unmeasured} />
                            ),
                            header: 'Replacements not measured',
                            id: ReplacementCardColumn.ReplacementsNotMeasured,
                            meta: { align: DataTableAlign.End },
                        },
                    ]}
                    data={[...model.rows]}
                    isSortable={false}
                    pageSize={null}
                    rowId={(row) => row.key}
                />
            )}
        </OverviewPanel>
    );
});
