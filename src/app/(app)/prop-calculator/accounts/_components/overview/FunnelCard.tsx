import { memo } from 'react';

import { DataTable, DataTableAlign } from '~/components/ui/data-table';

import { type FunnelCardModel } from './overviewModel';

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
        <div className="flex flex-col gap-3">
            {model.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No account with a modeled plan yet.
                </p>
            ) : (
                <DataTable
                    columns={[
                        {
                            cell: ({ row }) => <>{row.original.firm}</>,
                            header: 'Firm',
                            id: FunnelByFirmColumn.Firm,
                        },
                        {
                            cell: ({ row }) => <>{row.original.purchased}</>,
                            header: 'Purchased',
                            id: FunnelByFirmColumn.Purchased,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => <>{row.original.passed}</>,
                            header: 'Passed',
                            id: FunnelByFirmColumn.Passed,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => <>{row.original.funded}</>,
                            header: 'Funded',
                            id: FunnelByFirmColumn.Funded,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => <>{row.original.firstPayout}</>,
                            header: 'First payout',
                            id: FunnelByFirmColumn.FirstPayout,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => <>{row.original.movedLive}</>,
                            header: 'Moved live',
                            id: FunnelByFirmColumn.MovedLive,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <>{row.original.structuralBusts}</>
                            ),
                            header: 'Structural busts',
                            id: FunnelByFirmColumn.StructuralBusts,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <>{row.original.withinPlanBusts}</>
                            ),
                            header: 'Within-plan busts',
                            id: FunnelByFirmColumn.WithinPlanBusts,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => <>{row.original.unknownBusts}</>,
                            header: 'Unknown busts',
                            id: FunnelByFirmColumn.UnknownBusts,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => <>{row.original.payoutRate}</>,
                            header: 'Payout rate',
                            id: FunnelByFirmColumn.PayoutRate,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => <>{row.original.fees}</>,
                            header: 'Fees',
                            id: FunnelByFirmColumn.Fees,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => <>{row.original.netPayouts}</>,
                            header: 'Net payouts',
                            id: FunnelByFirmColumn.NetPayouts,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => <>{row.original.net}</>,
                            header: 'Net',
                            id: FunnelByFirmColumn.Net,
                            meta: { align: DataTableAlign.End },
                        },
                    ]}
                    data={[...model.rows]}
                    isSortable={false}
                    pageSize={null}
                    rowId={(row) => row.key}
                />
            )}
            {model.stageDollars.length > 0 && (
                <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-medium text-foreground">
                        Dollars per stage (fees of the accounts that reached
                        this stage)
                    </h3>
                    <DataTable
                        columns={[
                            {
                                cell: ({ row }) => <>{row.original.firm}</>,
                                header: 'Firm',
                                id: FunnelByStageColumn.Firm,
                            },
                            {
                                cell: ({ row }) => <>{row.original.stage}</>,
                                header: 'Stage',
                                id: FunnelByStageColumn.Stage,
                            },
                            {
                                cell: ({ row }) => <>{row.original.fees}</>,
                                header: 'Fees',
                                id: FunnelByStageColumn.Fees,
                                meta: { align: DataTableAlign.End },
                            },
                            {
                                cell: ({ row }) => (
                                    <>{row.original.netPayouts}</>
                                ),
                                header: 'Net payouts',
                                id: FunnelByStageColumn.NetPayouts,
                                meta: { align: DataTableAlign.End },
                            },
                            {
                                cell: ({ row }) => <>{row.original.net}</>,
                                header: 'Net',
                                id: FunnelByStageColumn.Net,
                                meta: { align: DataTableAlign.End },
                            },
                        ]}
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
            <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                {model.disclosures.map((disclosure) => (
                    <li key={disclosure}>{disclosure}</li>
                ))}
            </ul>
        </div>
    );
});
