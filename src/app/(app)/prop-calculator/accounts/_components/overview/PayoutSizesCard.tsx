'use client';

import { memo } from 'react';
import { Bar, BarChart, XAxis, YAxis } from 'recharts';

import {
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
            <p className="text-sm text-muted-foreground">No paid payout yet.</p>
        );
    }
    return (
        <div className="flex flex-col gap-6">
            <dl className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                <Stat label="Mean" value={model.mean} />
                <Stat label="Median" value={model.median} />
                <Stat label="p10" value={model.p10} />
                <Stat label="p90" value={model.p90} />
            </dl>
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
            {model.disclosures.length > 0 && (
                <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                    {model.disclosures.map((disclosure) => (
                        <li key={disclosure}>{disclosure}</li>
                    ))}
                </ul>
            )}
        </div>
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
                    dataKey="count"
                    fill="var(--color-count)"
                    fillOpacity={0.75}
                    isAnimationActive={false}
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
            <h3 className="text-sm font-medium text-foreground">{title}</h3>
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

function Stat({
    label,
    value,
}: {
    readonly label: string;
    readonly value: string;
}) {
    return (
        <div>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold text-foreground tabular-nums">
                {value}
            </dd>
        </div>
    );
}
