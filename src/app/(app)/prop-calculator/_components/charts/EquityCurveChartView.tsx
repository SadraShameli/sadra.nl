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
    median: { label: 'Median path', color: 'hsl(var(--chart-1))' },
    sample: { label: 'Sample path', color: 'hsl(var(--chart-2))' },
};

type ChartRow = Record<string, number | null>;

function buildChartData(curves: readonly number[][]): ChartRow[] {
    if (curves.length === 0) return [];
    let maxLen = 0;
    for (const c of curves) if (c.length > maxLen) maxLen = c.length;

    const rows: ChartRow[] = [];
    for (let day = 0; day < maxLen; day++) {
        const row: ChartRow = { day, median: null };
        const valuesAtDay: number[] = [];
        for (let i = 0; i < curves.length; i++) {
            const curve = curves[i];
            if (!curve) continue;
            const v = curve[day];
            row[`p${i}`] = v ?? null;
            if (v !== undefined) valuesAtDay.push(v);
        }
        if (valuesAtDay.length > 0) {
            valuesAtDay.sort((a, b) => a - b);
            const mid = Math.floor(valuesAtDay.length / 2);
            row.median =
                valuesAtDay.length % 2 === 0
                    ? ((valuesAtDay[mid - 1] ?? 0) + (valuesAtDay[mid] ?? 0)) /
                      2
                    : (valuesAtDay[mid] ?? 0);
        }
        rows.push(row);
    }
    return rows;
}

export default function EquityCurveChartView({ result }: Props) {
    if (result.sampleEquityCurves.length === 0) {
        return (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                No simulation data yet.
            </div>
        );
    }

    const data = buildChartData(result.sampleEquityCurves);
    const targetLine = result.accountSize + result.profitTarget;
    const drawdownLine = result.initialThreshold;
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
                    tickFormatter={(v: number) => formatCompactCurrency(v)}
                    tickLine={false}
                    axisLine={false}
                    width={60}
                    domain={['auto', 'auto']}
                />
                <ReferenceLine
                    y={targetLine}
                    stroke="hsl(142 76% 45%)"
                    strokeDasharray="4 4"
                    label={{
                        value: 'Target',
                        position: 'right',
                        fill: 'hsl(142 76% 45%)',
                        fontSize: 11,
                    }}
                />
                <ReferenceLine
                    y={drawdownLine}
                    stroke="hsl(0 84% 60%)"
                    strokeDasharray="4 4"
                    label={{
                        value: 'Drawdown',
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
