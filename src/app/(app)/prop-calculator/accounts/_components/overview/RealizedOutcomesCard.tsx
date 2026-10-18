import { memo } from 'react';

import { DataTable, DataTableAlign } from '~/components/ui/data-table';

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
                <p className="text-sm text-muted-foreground">
                    No account with a modeled plan yet.
                </p>
            ) : (
                <DataTable
                    columns={[
                        {
                            cell: ({ row }) => <>{row.original.plan}</>,
                            header: 'Plan',
                            id: RealizedOutcomesCardColumn.Plan,
                            meta: { isRowHeader: true },
                        },
                        {
                            cell: ({ row }) => (
                                <>
                                    {row.original.passRate}
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
                                <span className="text-muted-foreground">
                                    {row.original.modeledPassRate}
                                </span>
                            ),
                            header: 'Modeled pass rate',
                            id: RealizedOutcomesCardColumn.ModeledPassRate,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <>{row.original.sessionsToFunded}</>
                            ),
                            header: 'Sessions to funded',
                            id: RealizedOutcomesCardColumn.SessionsToFunded,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <span className="text-muted-foreground">
                                    {row.original.modeledSessionsToFunded}
                                </span>
                            ),
                            header: 'Modeled sessions to funded',
                            id: RealizedOutcomesCardColumn.ModeledSessionsToFunded,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <>
                                    {row.original.fundedSurvival}
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
                                <span className="text-muted-foreground">
                                    {row.original.modeledFundedSurvival}
                                </span>
                            ),
                            header: 'Modeled funded survival',
                            id: RealizedOutcomesCardColumn.ModeledFundedSurvival,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => <>{row.original.openFunded}</>,
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
