'use client';

import {
    CartesianGrid,
    Line,
    LineChart,
    ReferenceLine,
    XAxis,
    YAxis,
} from 'recharts';

import { type SimOutputs } from '~/lib/prop-calculator';

import { type ChartConfig, ChartContainer } from '~/components/ui/Chart';

import { formatCompactCurrency } from '../helpers';

interface Props {
    result: SimOutputs;
}

const chartConfig: ChartConfig = {
    median: { label: 'Median drawdown', color: 'hsl(0 84% 60%)' },
    sample: { label: 'Sample drawdown', color: 'hsl(0 84% 60%)' },
};

type ChartRow = Record<string, number | null>;

function buildDrawdownData(curves: readonly number[][]): ChartRow[] {
    if (curves.length === 0) return [];
    let maxLen = 0;
    for (const c of curves) if (c.length > maxLen) maxLen = c.length;

    const ddSeries = curves.map((curve) => {
        const out: number[] = [];
        let peak = curve[0] ?? 0;
        for (const v of curve) {
            if (v > peak) peak = v;
            out.push(peak - v);
        }
        return out;
    });

    const rows: ChartRow[] = [];
    for (let day = 0; day < maxLen; day++) {
        const row: ChartRow = { day, median: null };
        const valuesAtDay: number[] = [];
        for (let i = 0; i < ddSeries.length; i++) {
            const series = ddSeries[i];
            if (!series) continue;
            const v = series[day];
            row[`p${i}`] = v ?? null;
            if (v !== undefined) valuesAtDay.push(v);
        }
        if (valuesAtDay.length > 0) {
            valuesAtDay.sort((a, b) => a - b);
            const mid = Math.floor(valuesAtDay.length / 2);
            row.median =
                valuesAtDay.length % 2 === 0
                    ? ((valuesAtDay[mid - 1] ?? 0) +
                          (valuesAtDay[mid] ?? 0)) /
                      2
                    : (valuesAtDay[mid] ?? 0);
        }
        rows.push(row);
    }
    return rows;
}

export default function DrawdownCurveChartView({ result }: Props) {
    if (result.sampleEquityCurves.length === 0) {
        return (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                No simulation data yet.
            </div>
        );
    }

    const data = buildDrawdownData(result.sampleEquityCurves);
    const drawdownLimit = result.drawdownAmount;
    const pathCount = result.sampleEquityCurves.length;

    return (
        <ChartContainer config={chartConfig} className="aspect-16/7 w-full">
            <LineChart
                data={data}
                margin={{ top: 10, right: 12, left: 0, bottom: 28 }}
            >
                <CartesianGrid strokeDasharray="3 3" stroke="#ccc" />
                <XAxis
                    dataKey="day"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={6}
                    label={{
                        value: 'Trading day',
                        position: 'bottom',
                        offset: 12,
                        fontSize: 11,
                    }}
                />
                <YAxis
                    tickFormatter={(v: number) => `-${formatCompactCurrency(v)}`}
                    tickLine={false}
                    axisLine={false}
                    width={60}
                    domain={[0, 'auto']}
                    reversed
                />
                <ReferenceLine
                    y={drawdownLimit}
                    stroke="hsl(0 84% 60%)"
                    strokeDasharray="4 4"
                    label={{
                        value: 'Bust limit',
                        position: 'right',
                        fill: 'hsl(0 84% 60%)',
                        fontSize: 11,
                    }}
                />
                {Array.from({ length: pathCount }).map((_, i) => (
                    <Line
                        key={i}
                        type="monotone"
                        dataKey={`p${i}`}
                        stroke="var(--color-sample)"
                        strokeOpacity={0.18}
                        strokeWidth={1}
                        dot={false}
                        isAnimationActive={false}
                        connectNulls={false}
                    />
                ))}
                <Line
                    type="monotone"
                    dataKey="median"
                    stroke="var(--color-median)"
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                />
            </LineChart>
        </ChartContainer>
    );
}
