'use client';

import { memo } from 'react';

import { PanelErrorBoundary } from '~/components/PanelErrorBoundary';
import { DataTable, DataTableAlign } from '~/components/ui/data-table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { formatDisplayMonth, NOT_APPLICABLE } from '~/lib/format';

import { MonthlyPayoutChart } from './MonthlyPayoutChart';
import { type StatementCardModel } from './overviewModel';
import { OverviewPanel } from './OverviewPanel';
import { OverviewSectionId } from './overviewSections';
import { PurchaseCohortsView } from './PurchaseCohortsView';

enum StatementCardColumn {
    CumulativeNet = 'cumulative-net',
    Growth = 'growth',
    MeetsTarget = 'meets-target',
    Month = 'month',
    Multiple = 'multiple',
    Net = 'net',
    PayoutCount = 'payout-count',
    PayoutsReceived = 'payouts-received',
    Spend = 'spend',
    Trailing3MonthMultiple = 'trailing-3-month-multiple',
}

enum StatementView {
    ByPurchaseCohort = 'by-purchase-cohort',
    CashByMonth = 'cash-by-month',
}

export const StatementCard = memo(function StatementCard({
    model,
}: {
    readonly model: StatementCardModel;
}) {
    return model.months.length === 0 ? (
        <OverviewPanel section={OverviewSectionId.Statement}>
            <p className="text-sm text-muted-foreground">
                No fee, payout or event recorded yet.
            </p>
        </OverviewPanel>
    ) : (
        <OverviewPanel
            info={model.caveat}
            section={OverviewSectionId.Statement}
        >
            <PanelErrorBoundary section="Monthly payout chart">
                <MonthlyPayoutChart
                    points={model.chart}
                    targetDollars={model.targetDollars}
                />
            </PanelErrorBoundary>
            <Tabs
                className="flex flex-col gap-1"
                defaultValue={StatementView.CashByMonth}
            >
                <TabsList className="self-start">
                    <TabsTrigger value={StatementView.CashByMonth}>
                        Cash by month
                    </TabsTrigger>
                    <TabsTrigger value={StatementView.ByPurchaseCohort}>
                        By purchase cohort
                    </TabsTrigger>
                </TabsList>
                <TabsContent value={StatementView.CashByMonth}>
                    <PanelErrorBoundary section="Cash by month">
                        <CashByMonthTable model={model} />
                    </PanelErrorBoundary>
                </TabsContent>
                <TabsContent value={StatementView.ByPurchaseCohort}>
                    <PanelErrorBoundary section="Purchase cohorts">
                        <PurchaseCohortsView rows={model.purchaseCohorts} />
                    </PanelErrorBoundary>
                </TabsContent>
            </Tabs>
        </OverviewPanel>
    );
});

function CashByMonthTable({ model }: { readonly model: StatementCardModel }) {
    return (
        <DataTable
            columns={[
                {
                    cell: ({ row }) => (
                        <span className="tabular-nums">
                            {formatDisplayMonth(row.original.month)}
                            {row.original.isPartial && (
                                <span className="ml-1 text-xs text-muted-foreground">
                                    (partial)
                                </span>
                            )}
                        </span>
                    ),
                    header: 'Month',
                    id: StatementCardColumn.Month,
                    meta: { isRowHeader: true },
                },
                {
                    cell: ({ row }) => <>{row.original.spend}</>,
                    header: 'Spend',
                    id: StatementCardColumn.Spend,
                    meta: { align: DataTableAlign.End },
                },
                {
                    cell: ({ row }) => <>{row.original.payouts}</>,
                    header: 'Payouts received',
                    id: StatementCardColumn.PayoutsReceived,
                    meta: { align: DataTableAlign.End },
                },
                {
                    cell: ({ row }) => <>{row.original.payoutCount}</>,
                    header: 'Payout count',
                    id: StatementCardColumn.PayoutCount,
                    meta: { align: DataTableAlign.End },
                },
                {
                    cell: ({ row }) => <>{row.original.net}</>,
                    header: 'Net',
                    id: StatementCardColumn.Net,
                    meta: { align: DataTableAlign.End },
                },
                {
                    cell: ({ row }) => <>{row.original.cumulativeNet}</>,
                    header: 'Cumulative net',
                    id: StatementCardColumn.CumulativeNet,
                    meta: { align: DataTableAlign.End },
                },
                {
                    cell: ({ row }) => <>{row.original.multiple}</>,
                    header: 'Multiple',
                    id: StatementCardColumn.Multiple,
                    meta: { align: DataTableAlign.End },
                },
                {
                    cell: ({ row }) => (
                        <>{row.original.trailingThreeMonthMultiple}</>
                    ),
                    header: 'Trailing 3-month multiple',
                    id: StatementCardColumn.Trailing3MonthMultiple,
                    meta: { align: DataTableAlign.End },
                },
                {
                    cell: ({ row }) => <>{row.original.payoutGrowth}</>,
                    header: 'Growth',
                    id: StatementCardColumn.Growth,
                    meta: { align: DataTableAlign.End },
                },
                {
                    cell: ({ row }) => (
                        <>
                            {meetsTargetLabel(
                                row.original.meetsPayoutTarget,
                                row.original.meetsMultipleTarget,
                            )}
                        </>
                    ),
                    header: 'Meets target',
                    id: StatementCardColumn.MeetsTarget,
                },
            ]}
            data={[...model.months]}
            isSortable={false}
            pageSize={null}
            rowId={(row) => row.key}
        />
    );
}

function meetsTargetLabel(
    meetsPayoutTarget: boolean | null,
    meetsMultipleTarget: boolean | null,
): string {
    if (meetsPayoutTarget === null && meetsMultipleTarget === null) {
        return NOT_APPLICABLE;
    }
    const wasMet = (meetsPayoutTarget ?? true) && (meetsMultipleTarget ?? true);
    return wasMet ? 'Yes' : 'No';
}
