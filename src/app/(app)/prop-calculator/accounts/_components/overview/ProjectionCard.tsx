import { TrendingUp } from 'lucide-react';
import { memo } from 'react';

import CashFlowBandChartView from '~/app/(app)/prop-calculator/_components/charts/CashFlowBandChartView';
import { SimulationFailureNotice } from '~/app/(app)/prop-calculator/_components/SimulationFailureNotice';
import { figureColumns } from '~/app/(app)/prop-calculator/accounts/_components/FigureText';
import { PanelSubheading } from '~/components/PanelSubheading';
import { DataTable, DataTableAlign } from '~/components/ui/data-table';

import { ModelFailureNote, ModelStatusPanel } from './ModelStatusPanel';
import {
    ExpectedNetStatus,
    type ProjectionCardModel,
    type ProjectionRow,
} from './overviewModel';
import { InfoLines, InfoStack, OverviewPanel } from './OverviewPanel';
import { OverviewSectionId } from './overviewSections';

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
            <ModelStatusPanel
                emptyTitle="No modeled plan to project yet"
                icon={TrendingUp}
                section={OverviewSectionId.FreshStartProjection}
                status={model.status}
                statusNote={model.statusNote}
            />
        );
    }
    return (
        <OverviewPanel
            info={
                <InfoStack>
                    {model.rows.map((row) => (
                        <p key={row.key}>
                            {row.plan}: {row.labels.startBasis};{' '}
                            {row.labels.trials}; {row.labels.horizon};{' '}
                            {row.labels.retainedCushion};{' '}
                            {row.labels.payoutPolicy};{' '}
                            {row.labels.lifetimeCapBasis};{' '}
                            {row.labels.tradesPerDay}. {row.labels.creditBasis}
                        </p>
                    ))}
                    <InfoLines lines={model.disclosures} />
                </InfoStack>
            }
            isComputing={model.status === ExpectedNetStatus.Pending}
            section={OverviewSectionId.FreshStartProjection}
        >
            <ModelFailureNote
                status={model.status}
                statusNote={model.statusNote}
            />
            <DataTable
                columns={figureColumns(
                    [
                        {
                            header: 'Plan',
                            id: ProjectionCardColumn.Plan,
                            isRowHeader: true,
                            textOf: (row) => row.plan,
                        },
                        {
                            header: 'Accounts',
                            id: ProjectionCardColumn.Accounts,
                            textOf: (row) => row.accounts,
                        },
                        {
                            align: DataTableAlign.End,
                            header: 'Final net, P10',
                            id: ProjectionCardColumn.FinalNetP10,
                            textOf: (row) => row.finalNet.p10,
                        },
                        {
                            align: DataTableAlign.End,
                            header: 'Final net, median',
                            id: ProjectionCardColumn.FinalNetMedian,
                            textOf: (row) => row.finalNet.p50,
                        },
                        {
                            align: DataTableAlign.End,
                            header: 'Final net, P90',
                            id: ProjectionCardColumn.FinalNetP90,
                            textOf: (row) => row.finalNet.p90,
                        },
                        {
                            align: DataTableAlign.End,
                            header: 'Median spend',
                            id: ProjectionCardColumn.MedianSpend,
                            textOf: (row) => row.finalSpendMedian,
                        },
                        {
                            align: DataTableAlign.End,
                            header: 'Median payouts',
                            id: ProjectionCardColumn.MedianPayouts,
                            textOf: (row) => row.finalPayoutMedian,
                        },
                        {
                            align: DataTableAlign.End,
                            header: 'Chance the final net is negative',
                            id: ProjectionCardColumn.ChanceTheFinalNetIsNegative,
                            textOf: (row) => row.probabilityFinalNetNegative,
                        },
                        {
                            align: DataTableAlign.End,
                            header: 'Chance of ever being cash-positive',
                            id: ProjectionCardColumn.ChanceOfEverBeingCashPositive,
                            textOf: (row) => row.probabilityEverPositive,
                        },
                        {
                            header: 'Break-even month',
                            id: ProjectionCardColumn.BreakEvenMonth,
                            textOf: (row) => row.breakEvenMonth,
                        },
                    ],
                    model.rows,
                )}
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
        </OverviewPanel>
    );
});

function ProjectionDetail({ row }: { readonly row: ProjectionRow }) {
    return (
        <div className="flex flex-col gap-2">
            {row.result !== null && (
                <>
                    <PanelSubheading>
                        {row.plan}: net cash by month, P10 to P90 band and
                        median
                    </PanelSubheading>
                    <CashFlowBandChartView result={row.result} />
                </>
            )}
            {row.notHonoured.length > 0 && (
                <ul
                    aria-label={`Policy fields the timeline does not honour for ${row.plan}`}
                    className="flex list-disc flex-col gap-1 pl-5 text-xs"
                >
                    {row.notHonoured.map((text) => (
                        <li key={text}>{text}</li>
                    ))}
                </ul>
            )}
        </div>
    );
}
