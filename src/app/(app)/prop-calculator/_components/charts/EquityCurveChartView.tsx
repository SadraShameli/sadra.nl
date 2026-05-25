'use client';

import {
    CartesianGrid,
    Line,
    LineChart,
    ReferenceLine,
    XAxis,
    YAxis,
} from 'recharts';

import { type ChartConfig, ChartContainer } from '~/components/ui/Chart';
import { formatCompactCurrency } from '~/lib/format';
import { type SimOutputs } from '~/lib/prop-calculator';
import { cn } from '~/lib/utils';

interface Props {
    result: SimOutputs;
}

const chartConfig: ChartConfig = {
    median: { color: 'hsl(var(--chart-1))', label: 'Median path' },
    sample: { color: 'hsl(var(--chart-2))', label: 'Sample path' },
};

type ChartRow = Record<string, null | number>;

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
        <ChartContainer
            className={cn(
                'app-prop-calculator__equity-curve-chart',
                'aspect-16/7 min-h-125 w-full',
            )}
            config={chartConfig}
        >
            <LineChart
                data={data}
                margin={{ bottom: 28, left: 0, right: 12, top: 10 }}
            >
                <CartesianGrid stroke="#ccc" strokeDasharray="3 3" />
                <XAxis
                    axisLine={false}
                    dataKey="day"
                    label={{
                        fontSize: 11,
                        offset: 12,
                        position: 'bottom',
                        value: 'Trading day',
                    }}
                    tickLine={false}
                    tickMargin={6}
                />
                <YAxis
                    axisLine={false}
                    domain={['auto', 'auto']}
                    tickFormatter={(v: number) => formatCompactCurrency(v)}
                    tickLine={false}
                    width={60}
                />
                <ReferenceLine
                    label={{
                        fill: 'hsl(142 76% 45%)',
                        fontSize: 11,
                        position: 'right',
                        value: 'Target',
                    }}
                    stroke="hsl(142 76% 45%)"
                    strokeDasharray="4 4"
                    y={targetLine}
                />
                <ReferenceLine
                    label={{
                        fill: 'hsl(0 84% 60%)',
                        fontSize: 11,
                        position: 'right',
                        value: 'Drawdown',
                    }}
                    stroke="hsl(0 84% 60%)"
                    strokeDasharray="4 4"
                    y={drawdownLine}
                />
                {Array.from({ length: pathCount }).map((_, i) => (
                    <Line
                        connectNulls={false}
                        dataKey={`p${i}`}
                        dot={false}
                        isAnimationActive={false}
                        key={i}
                        stroke="var(--color-sample)"
                        strokeOpacity={0.18}
                        strokeWidth={1}
                        type="monotone"
                    />
                ))}
                <Line
                    connectNulls
                    dataKey="median"
                    dot={false}
                    isAnimationActive={false}
                    stroke="var(--color-median)"
                    strokeWidth={2.5}
                    type="monotone"
                />
            </LineChart>
        </ChartContainer>
    );
}

function buildChartData(curves: readonly number[][]): ChartRow[] {
    if (curves.length === 0) return [];
    let maxLen = 0;
    for (const c of curves) if (c.length > maxLen) maxLen = c.length;

    const rows: ChartRow[] = [];
    for (let day = 0; day < maxLen; day++) {
        const row: ChartRow = { day, median: null };
        const valuesAtDay: number[] = [];
        for (const [i, curve] of curves.entries()) {
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
