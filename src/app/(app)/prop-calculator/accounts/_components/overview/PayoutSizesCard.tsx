import HistogramChartView from '~/app/(app)/prop-calculator/_components/charts/HistogramChartView';
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

export function payoutHistogramValues(
    histogram: readonly HistogramBin[],
): number[] {
    return histogram.flatMap((bin, index) => {
        const points = Array.from({ length: bin.count }, () => bin.binCenter);
        if (points.length === 0) return points;
        if (index === 0) points[0] = bin.binStart;
        if (index === histogram.length - 1) {
            points[points.length - 1] = bin.binEnd;
        }
        return points;
    });
}

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
    const histogramValues = payoutHistogramValues(model.histogram);
    return (
        <div className="flex flex-col gap-6">
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                <Stat label="Mean" value={model.mean} />
                <Stat label="Median" value={model.median} />
                <Stat label="p10" value={model.p10} />
                <Stat label="p90" value={model.p90} />
            </dl>
            <HistogramChartView
                aspectClassName="aspect-[16/9]"
                barColor="var(--chart-1)"
                barLabel="Payouts"
                binCount={Math.max(1, model.histogram.length)}
                emptyMessage="No paid payout yet."
                values={histogramValues}
                wrapperClassName="w-full"
                xAxisLabel="Net payout"
                xAxisTickFormatter={(value) =>
                    formatCompactCurrency(value / 100)
                }
            />
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

function PayoutSizeTable({
    columnLabel,
    rows,
    title,
}: {
    readonly columnLabel: string;
    readonly rows: readonly {
        readonly count: string;
        readonly key: string;
        readonly label: string;
        readonly mean: string;
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
