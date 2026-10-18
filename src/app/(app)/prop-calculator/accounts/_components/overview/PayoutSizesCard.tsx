'use client';

import { memo } from 'react';
import { Bar, BarChart, XAxis, YAxis } from 'recharts';

import { PanelSubheading } from '~/components/PanelSubheading';
import { StatStrip } from '~/components/StatStrip';
import {
    CHART_BAR_PROPS,
    CHART_X_AXIS_PROPS,
    CHART_Y_AXIS_PROPS,
    type ChartConfig,
    ChartContainer,
} from '~/components/ui/chart';
import {
    DataTable,
    DataTableAlign,
    type DataTableColumn,
} from '~/components/ui/data-table';
import { formatCompactCurrency } from '~/lib/format';
import { type HistogramBin } from '~/lib/prop-calculator/stats';

import { type PayoutSizesCardModel } from './overviewModel';
import { infoLinesOf, OverviewPanel } from './OverviewPanel';
import { OverviewSectionId } from './overviewSections';

const histogramConfig: ChartConfig = {
    count: { color: 'var(--chart-1)', label: 'Payouts' },
};

export const PayoutSizesCard = memo(function PayoutSizesCard({
    model,
}: {
    readonly model: PayoutSizesCardModel;
}) {
    if (model.count === 0) {
        return (
            <OverviewPanel section={OverviewSectionId.PayoutSizes}>
                <p className="text-sm text-muted-foreground">
                    No paid payout yet.
                </p>
            </OverviewPanel>
        );
    }
    return (
        <OverviewPanel
            contentClassName="gap-6"
            info={infoLinesOf(model.disclosures)}
            section={OverviewSectionId.PayoutSizes}
        >
            <StatStrip
                items={[
                    { id: 'mean', label: 'Mean', value: model.mean },
                    { id: 'median', label: 'Median', value: model.median },
                    { id: 'p10', label: 'p10', value: model.p10 },
                    { id: 'p90', label: 'p90', value: model.p90 },
                ]}
            />
            <div className="flex flex-col gap-2">
                <PayoutHistogram bins={model.histogram} />
                <p className="text-xs text-muted-foreground">
                    Bucket width {model.bucketWidth}
                </p>
            </div>
            <PayoutSizeTable
                columnLabel="Account size"
                rows={model.byAccountSize.map((row) => ({
                    count: row.count,
                    key: row.key,
                    label: row.accountSize,
                    mean: row.mean,
                }))}
                title="By account size"
            />
            <PayoutSizeTable
                columnLabel="Firm"
                rows={model.byFirm.map((row) => ({
                    count: row.count,
                    key: row.key,
                    label: row.firm,
                    mean: row.mean,
                }))}
                title="By firm"
            />
            <PayoutSizeTable
                columnLabel="Stage at payout"
                rows={model.byStage.map((row) => ({
                    count: row.count,
                    key: row.key,
                    label: row.stage,
                    mean: row.mean,
                }))}
                title="By stage at payout"
            />
            <PayoutSizeTable
                columnLabel="Balance at payout"
                medianLabel="Median payout"
                rows={model.byBalance.map((row) => ({
                    count: row.count,
                    key: row.key,
                    label: row.label,
                    mean: row.mean,
                    median: row.median,
                }))}
                title="By balance at payout"
            />
        </OverviewPanel>
    );
});

enum PayoutSizeColumn {
    Count = 'count',
    Label = 'label',
    Mean = 'mean',
    Median = 'median',
}

interface PayoutSizeRow {
    readonly count: string;
    readonly key: string;
    readonly label: string;
    readonly mean: string;
    readonly median?: string;
}

function PayoutHistogram({ bins }: { readonly bins: readonly HistogramBin[] }) {
    const data = bins.map((bin) => ({
        center: bin.binCenter,
        count: bin.count,
    }));
    return (
        <ChartContainer config={histogramConfig}>
            <BarChart
                data={data}
                margin={{ bottom: 28, left: 0, right: 12, top: 10 }}
            >
                <XAxis
                    {...CHART_X_AXIS_PROPS}
                    dataKey="center"
                    label={{
                        fontSize: 11,
                        offset: 12,
                        position: 'bottom',
                        value: 'Net payout',
                    }}
                    tickFormatter={(value: number) =>
                        formatCompactCurrency(value / 100)
                    }
                />
                <YAxis
                    {...CHART_Y_AXIS_PROPS}
                    allowDecimals={false}
                    label={{
                        angle: -90,
                        fontSize: 11,
                        position: 'insideLeft',
                        value: 'Payouts',
                    }}
                />
                <Bar
                    {...CHART_BAR_PROPS}
                    dataKey="count"
                    fill="var(--color-count)"
                    fillOpacity={0.75}
                />
            </BarChart>
        </ChartContainer>
    );
}

function payoutSizeColumns(
    columnLabel: string,
    medianLabel: string | undefined,
): DataTableColumn<PayoutSizeRow>[] {
    const columns: DataTableColumn<PayoutSizeRow>[] = [
        {
            cell: ({ row: { original: row } }) => row.label,
            header: columnLabel,
            id: PayoutSizeColumn.Label,
            meta: { isRowHeader: true },
        },
        {
            cell: ({ row: { original: row } }) => row.count,
            header: 'Count',
            id: PayoutSizeColumn.Count,
            meta: { align: DataTableAlign.End },
        },
        {
            cell: ({ row: { original: row } }) => row.mean,
            header: 'Mean payout',
            id: PayoutSizeColumn.Mean,
            meta: { align: DataTableAlign.End },
        },
    ];
    return medianLabel === undefined
        ? columns
        : [
              ...columns,
              {
                  cell: ({ row: { original: row } }) => row.median,
                  header: medianLabel,
                  id: PayoutSizeColumn.Median,
                  meta: { align: DataTableAlign.End },
              },
          ];
}

function PayoutSizeTable({
    columnLabel,
    medianLabel,
    rows,
    title,
}: {
    readonly columnLabel: string;
    readonly medianLabel?: string;
    readonly rows: readonly PayoutSizeRow[];
    readonly title: string;
}) {
    if (rows.length === 0) return null;
    return (
        <div className="flex flex-col gap-2">
            <PanelSubheading>{title}</PanelSubheading>
            <DataTable
                columns={payoutSizeColumns(columnLabel, medianLabel)}
                data={[...rows]}
                isSortable={false}
                pageSize={null}
                rowId={(row) => row.key}
            />
        </div>
    );
}
