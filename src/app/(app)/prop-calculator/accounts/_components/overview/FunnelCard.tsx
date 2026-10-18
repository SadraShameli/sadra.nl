import { Filter } from 'lucide-react';
import { memo } from 'react';

import { figureColumns } from '~/app/(app)/prop-calculator/accounts/_components/FigureText';
import { PanelSubheading } from '~/components/PanelSubheading';
import { DataTable, DataTableAlign } from '~/components/ui/data-table';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';

import { type FunnelCardModel } from './overviewModel';
import { infoLinesOf, OverviewPanel } from './OverviewPanel';
import { OverviewSectionId } from './overviewSections';

enum FunnelByFirmColumn {
    Fees = 'fees',
    Firm = 'firm',
    FirstPayout = 'first-payout',
    Funded = 'funded',
    MovedLive = 'moved-live',
    Net = 'net',
    NetPayouts = 'net-payouts',
    Passed = 'passed',
    PayoutRate = 'payout-rate',
    Purchased = 'purchased',
    StructuralBusts = 'structural-busts',
    UnknownBusts = 'unknown-busts',
    WithinPlanBusts = 'within-plan-busts',
}

enum FunnelByStageColumn {
    Fees = 'fees',
    Firm = 'firm',
    Net = 'net',
    NetPayouts = 'net-payouts',
    Stage = 'stage',
}

export const FunnelCard = memo(function FunnelCard({
    model,
}: {
    readonly model: FunnelCardModel;
}) {
    return (
        <OverviewPanel
            info={infoLinesOf(model.disclosures)}
            section={OverviewSectionId.Funnel}
        >
            {model.rows.length === 0 ? (
                <EmptyState
                    icon={Filter}
                    size={EmptyStateSize.Compact}
                    title="No account with a modeled plan yet"
                />
            ) : (
                <DataTable
                    columns={figureColumns(
                        [
                            {
                                header: 'Firm',
                                id: FunnelByFirmColumn.Firm,
                                isRowHeader: true,
                                textOf: (row) => row.firm,
                            },
                            {
                                align: DataTableAlign.End,
                                header: 'Purchased',
                                id: FunnelByFirmColumn.Purchased,
                                textOf: (row) => row.purchased,
                            },
                            {
                                align: DataTableAlign.End,
                                header: 'Passed',
                                id: FunnelByFirmColumn.Passed,
                                textOf: (row) => row.passed,
                            },
                            {
                                align: DataTableAlign.End,
                                header: 'Funded',
                                id: FunnelByFirmColumn.Funded,
                                textOf: (row) => row.funded,
                            },
                            {
                                align: DataTableAlign.End,
                                header: 'First payout',
                                id: FunnelByFirmColumn.FirstPayout,
                                textOf: (row) => row.firstPayout,
                            },
                            {
                                align: DataTableAlign.End,
                                header: 'Moved live',
                                id: FunnelByFirmColumn.MovedLive,
                                textOf: (row) => row.movedLive,
                            },
                            {
                                align: DataTableAlign.End,
                                header: 'Structural busts',
                                id: FunnelByFirmColumn.StructuralBusts,
                                textOf: (row) => row.structuralBusts,
                            },
                            {
                                align: DataTableAlign.End,
                                header: 'Within-plan busts',
                                id: FunnelByFirmColumn.WithinPlanBusts,
                                textOf: (row) => row.withinPlanBusts,
                            },
                            {
                                align: DataTableAlign.End,
                                header: 'Unknown busts',
                                id: FunnelByFirmColumn.UnknownBusts,
                                textOf: (row) => row.unknownBusts,
                            },
                            {
                                align: DataTableAlign.End,
                                header: 'Payout rate',
                                id: FunnelByFirmColumn.PayoutRate,
                                textOf: (row) => row.payoutRate,
                            },
                            {
                                align: DataTableAlign.End,
                                header: 'Fees',
                                id: FunnelByFirmColumn.Fees,
                                textOf: (row) => row.fees,
                            },
                            {
                                align: DataTableAlign.End,
                                header: 'Net payouts',
                                id: FunnelByFirmColumn.NetPayouts,
                                textOf: (row) => row.netPayouts,
                            },
                            {
                                align: DataTableAlign.End,
                                header: 'Net',
                                id: FunnelByFirmColumn.Net,
                                textOf: (row) => row.net,
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
            {model.stageDollars.length > 0 && (
                <div className="flex flex-col gap-2">
                    <PanelSubheading>
                        Dollars per stage (fees of the accounts that reached
                        this stage)
                    </PanelSubheading>
                    <DataTable
                        columns={figureColumns(
                            [
                                {
                                    header: 'Firm',
                                    id: FunnelByStageColumn.Firm,
                                    isRowHeader: true,
                                    textOf: (row) => row.firm,
                                },
                                {
                                    header: 'Stage',
                                    id: FunnelByStageColumn.Stage,
                                    textOf: (row) => row.stage,
                                },
                                {
                                    align: DataTableAlign.End,
                                    header: 'Fees',
                                    id: FunnelByStageColumn.Fees,
                                    textOf: (row) => row.fees,
                                },
                                {
                                    align: DataTableAlign.End,
                                    header: 'Net payouts',
                                    id: FunnelByStageColumn.NetPayouts,
                                    textOf: (row) => row.netPayouts,
                                },
                                {
                                    align: DataTableAlign.End,
                                    header: 'Net',
                                    id: FunnelByStageColumn.Net,
                                    textOf: (row) => row.net,
                                },
                            ],
                            model.stageDollars,
                        )}
                        data={[...model.stageDollars]}
                        isSortable={false}
                        pageSize={null}
                        rowId={(row) => row.key}
                    />
                </div>
            )}
            {model.unresolvedNote !== null && (
                <p className="text-xs text-muted-foreground">
                    {model.unresolvedNote}
                </p>
            )}
            <p className="text-xs text-muted-foreground">
                {model.biggestWeakness}
            </p>
            {model.weaknesses.length > 0 && (
                <ul
                    aria-label="Biggest weakness by plan"
                    className="flex flex-col gap-1 text-sm"
                >
                    {model.weaknesses.map((weakness) => (
                        <li key={weakness.key}>
                            Biggest weakness, {weakness.plan}: {weakness.text}
                        </li>
                    ))}
                </ul>
            )}
            {model.untestedWeaknesses.length > 0 && (
                <ul
                    aria-label="Untested stages by plan"
                    className="flex flex-col gap-1 text-sm"
                >
                    {model.untestedWeaknesses.map((weakness) => (
                        <li key={weakness.key}>
                            {weakness.plan}: {weakness.text}
                        </li>
                    ))}
                </ul>
            )}
            {model.diagnosticIssues.length > 0 && (
                <ul
                    aria-label="Funnel diagnostic issues by plan"
                    className="flex flex-col gap-1 text-sm text-warning"
                >
                    {model.diagnosticIssues.map((issue) => (
                        <li key={issue.key}>
                            {issue.plan}: {issue.text}
                        </li>
                    ))}
                </ul>
            )}
        </OverviewPanel>
    );
});
