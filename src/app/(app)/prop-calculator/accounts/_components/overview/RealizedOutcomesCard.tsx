import { ListChecks } from 'lucide-react';
import { memo } from 'react';

import { FigureText } from '~/app/(app)/prop-calculator/accounts/_components/FigureText';
import { DataTable, DataTableAlign } from '~/components/ui/data-table';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';

import { type OutcomesCardModel } from './overviewModel';
import { infoLinesOf, OverviewPanel } from './OverviewPanel';
import { OverviewSectionId } from './overviewSections';

enum RealizedOutcomesCardColumn {
    FundedSurvival = 'funded-survival',
    ModeledFundedSurvival = 'modeled-funded-survival',
    ModeledPassRate = 'modeled-pass-rate',
    ModeledSessionsToFunded = 'modeled-sessions-to-funded',
    PassRate = 'pass-rate',
    Plan = 'plan',
    SessionsToFunded = 'sessions-to-funded',
    StillOpen = 'still-open',
}

export const RealizedOutcomesCard = memo(function RealizedOutcomesCard({
    model,
}: {
    readonly model: OutcomesCardModel;
}) {
    return (
        <OverviewPanel
            info={infoLinesOf(model.disclosures)}
            section={OverviewSectionId.Outcomes}
        >
            {model.rows.length === 0 ? (
                <EmptyState
                    icon={ListChecks}
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
                            id: RealizedOutcomesCardColumn.Plan,
                            meta: { isRowHeader: true },
                        },
                        {
                            cell: ({ row }) => (
                                <>
                                    <FigureText text={row.original.passRate} />
                                    <span className="block text-xs text-muted-foreground">
                                        {row.original.passRateCounts}
                                    </span>
                                </>
                            ),
                            header: 'Pass rate',
                            id: RealizedOutcomesCardColumn.PassRate,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <FigureText
                                    className="text-muted-foreground"
                                    text={row.original.modeledPassRate}
                                />
                            ),
                            header: 'Modeled pass rate',
                            id: RealizedOutcomesCardColumn.ModeledPassRate,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <FigureText
                                    text={row.original.sessionsToFunded}
                                />
                            ),
                            header: 'Sessions to funded',
                            id: RealizedOutcomesCardColumn.SessionsToFunded,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <FigureText
                                    className="text-muted-foreground"
                                    text={row.original.modeledSessionsToFunded}
                                />
                            ),
                            header: 'Modeled sessions to funded',
                            id: RealizedOutcomesCardColumn.ModeledSessionsToFunded,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <>
                                    <FigureText
                                        text={row.original.fundedSurvival}
                                    />
                                    <span className="block text-xs text-muted-foreground">
                                        {row.original.fundedSurvivalCounts}
                                    </span>
                                </>
                            ),
                            header: 'Funded survival',
                            id: RealizedOutcomesCardColumn.FundedSurvival,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <FigureText
                                    className="text-muted-foreground"
                                    text={row.original.modeledFundedSurvival}
                                />
                            ),
                            header: 'Modeled funded survival',
                            id: RealizedOutcomesCardColumn.ModeledFundedSurvival,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <FigureText text={row.original.openFunded} />
                            ),
                            header: 'Still open',
                            id: RealizedOutcomesCardColumn.StillOpen,
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
