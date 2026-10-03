'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import { type ChartConfig, ChartContainer } from '~/components/ui/Chart';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';
import { formatCompactCurrency } from '~/lib/format';
import { type HistogramBin } from '~/lib/prop-calculator/stats';

import { type PayoutSizesCardModel } from './overviewModel';

const histogramConfig: ChartConfig = {
    count: { color: 'var(--chart-1)', label: 'Payouts' },
};

export function PayoutSizesCard({
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
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
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
}

function PayoutHistogram({ bins }: { readonly bins: readonly HistogramBin[] }) {
    const data = bins.map((bin) => ({
        center: bin.binCenter,
        count: bin.count,
    }));
    return (
        <ChartContainer
            className="aspect-[16/9] w-full"
            config={histogramConfig}
        >
            <BarChart
                data={data}
                margin={{ bottom: 28, left: 0, right: 12, top: 10 }}
            >
                <CartesianGrid stroke="#ccc" strokeDasharray="3 3" />
                <XAxis
                    axisLine={false}
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
                    tickLine={false}
                    tickMargin={6}
                />
                <YAxis
                    allowDecimals={false}
                    axisLine={false}
                    label={{
                        angle: -90,
                        fontSize: 11,
                        position: 'insideLeft',
                        value: 'Payouts',
                    }}
                    tickLine={false}
                    width={40}
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

function PayoutSizeTable({
    columnLabel,
    medianLabel,
    rows,
    title,
}: {
    readonly columnLabel: string;
    readonly medianLabel?: string;
    readonly rows: readonly {
        readonly count: string;
        readonly key: string;
        readonly label: string;
        readonly mean: string;
        readonly median?: string;
    }[];
    readonly title: string;
}) {
    if (rows.length === 0) return null;
    return (
        <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-white">{title}</h3>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>{columnLabel}</TableHead>
                        <TableHead className="text-right">Count</TableHead>
                        <TableHead className="text-right">
                            Mean payout
                        </TableHead>
                        {medianLabel !== undefined && (
                            <TableHead className="text-right">
                                {medianLabel}
                            </TableHead>
                        )}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((row) => (
                        <TableRow key={row.key}>
                            <TableCell>{row.label}</TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.count}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.mean}
                            </TableCell>
                            {row.median !== undefined && (
                                <TableCell className="text-right tabular-nums">
                                    {row.median}
                                </TableCell>
                            )}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
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
            <dd className="text-lg font-semibold text-white tabular-nums">
                {value}
            </dd>
        </div>
    );
}
