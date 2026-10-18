import { memo } from 'react';

import CashFlowBandChartView from '~/app/(app)/prop-calculator/_components/charts/CashFlowBandChartView';
import { SimulationFailureNotice } from '~/app/(app)/prop-calculator/_components/SimulationFailureNotice';
import { DataTable, DataTableAlign } from '~/components/ui/data-table';

import {
    ExpectedNetStatus,
    type ProjectionCardModel,
    type ProjectionRow,
} from './overviewModel';

enum ProjectionCardColumn {
    Accounts = 'accounts',
    BreakEvenMonth = 'break-even-month',
    ChanceOfEverBeingCashPositive = 'chance-of-ever-being-cash-positive',
    ChanceTheFinalNetIsNegative = 'chance-the-final-net-is-negative',
    FinalNetMedian = 'final-net-median',
    FinalNetP10 = 'final-net-p10',
    FinalNetP90 = 'final-net-p90',
    MedianPayouts = 'median-payouts',
    MedianSpend = 'median-spend',
    Plan = 'plan',
}

export const ProjectionCard = memo(function ProjectionCard({
    model,
}: {
    readonly model: ProjectionCardModel;
}) {
    if (model.rows.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                {model.statusNote ?? 'No plan to project yet.'}
            </p>
        );
    }
    return (
        <div className="flex flex-col gap-4">
            {model.status !== ExpectedNetStatus.Ready &&
                model.statusNote !== null && (
                    <p className="text-sm text-muted-foreground" role="status">
                        {model.statusNote}
                    </p>
                )}
            <DataTable
                columns={[
                    {
                        cell: ({ row }) => <>{row.original.plan}</>,
                        header: 'Plan',
                        id: ProjectionCardColumn.Plan,
                    },
                    {
                        cell: ({ row }) => <>{row.original.accounts}</>,
                        header: 'Accounts',
                        id: ProjectionCardColumn.Accounts,
                    },
                    {
                        cell: ({ row }) => <>{row.original.finalNet.p10}</>,
                        header: 'Final net, P10',
                        id: ProjectionCardColumn.FinalNetP10,
                        meta: { align: DataTableAlign.End },
                    },
                    {
                        cell: ({ row }) => <>{row.original.finalNet.p50}</>,
                        header: 'Final net, median',
                        id: ProjectionCardColumn.FinalNetMedian,
                        meta: { align: DataTableAlign.End },
                    },
                    {
                        cell: ({ row }) => <>{row.original.finalNet.p90}</>,
                        header: 'Final net, P90',
                        id: ProjectionCardColumn.FinalNetP90,
                        meta: { align: DataTableAlign.End },
                    },
                    {
                        cell: ({ row }) => <>{row.original.finalSpendMedian}</>,
                        header: 'Median spend',
                        id: ProjectionCardColumn.MedianSpend,
                        meta: { align: DataTableAlign.End },
                    },
                    {
                        cell: ({ row }) => (
                            <>{row.original.finalPayoutMedian}</>
                        ),
                        header: 'Median payouts',
                        id: ProjectionCardColumn.MedianPayouts,
                        meta: { align: DataTableAlign.End },
                    },
                    {
                        cell: ({ row }) => (
                            <>{row.original.probabilityFinalNetNegative}</>
                        ),
                        header: 'Chance the final net is negative',
                        id: ProjectionCardColumn.ChanceTheFinalNetIsNegative,
                        meta: { align: DataTableAlign.End },
                    },
                    {
                        cell: ({ row }) => (
                            <>{row.original.probabilityEverPositive}</>
                        ),
                        header: 'Chance of ever being cash-positive',
                        id: ProjectionCardColumn.ChanceOfEverBeingCashPositive,
                        meta: { align: DataTableAlign.End },
                    },
                    {
                        cell: ({ row }) => <>{row.original.breakEvenMonth}</>,
                        header: 'Break-even month',
                        id: ProjectionCardColumn.BreakEvenMonth,
                    },
                ]}
                data={[...model.rows]}
                isSortable={false}
                pageSize={null}
                rowId={(row) => row.key}
            />
            {model.rows.map((row) => (
                <ProjectionDetail key={row.key} row={row} />
            ))}
            {model.refused.map((refusal) => (
                <SimulationFailureNotice
                    key={refusal.key}
                    message={`${refusal.plan}: ${refusal.reason}`}
                />
            ))}
            <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                {model.disclosures.map((disclosure) => (
                    <li key={disclosure}>{disclosure}</li>
                ))}
            </ul>
        </div>
    );
});

function ProjectionDetail({ row }: { readonly row: ProjectionRow }) {
    return (
        <div className="flex flex-col gap-2">
            {row.result !== null && (
                <>
                    <p className="text-sm font-medium text-foreground">
                        {row.plan}: net cash by month, P10 to P90 band and
                        median
                    </p>
                    <CashFlowBandChartView result={row.result} />
                </>
            )}
            <p className="text-xs text-muted-foreground">
                {row.plan}: {row.labels.startBasis}; {row.labels.trials};{' '}
                {row.labels.horizon}; {row.labels.retainedCushion};{' '}
                {row.labels.payoutPolicy}; {row.labels.lifetimeCapBasis};{' '}
                {row.labels.tradesPerDay}. {row.labels.creditBasis}
            </p>
            {row.notHonoured.length > 0 && (
                <ul
                    aria-label={`Policy fields the timeline does not honour for ${row.plan}`}
                    className="flex list-disc flex-col gap-1 pl-5 text-xs text-warning"
                >
                    {row.notHonoured.map((text) => (
                        <li key={text}>{text}</li>
                    ))}
                </ul>
            )}
        </div>
    );
}
