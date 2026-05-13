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
import { type SimOutputs } from '~/lib/prop-calculator';

import { formatCompactCurrency } from '../helpers';

interface Props {
    result: SimOutputs;
}

const chartConfig: ChartConfig = {
    median: { color: 'hsl(0 84% 60%)', label: 'Median drawdown' },
    sample: { color: 'hsl(0 84% 60%)', label: 'Sample drawdown' },
};

type ChartRow = Record<string, null | number>;

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
        <ChartContainer
            className="aspect-16/7 min-h-125 w-full"
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
                    domain={[0, 'auto']}
                    reversed
                    tickFormatter={(v: number) =>
                        `-${formatCompactCurrency(v)}`
                    }
                    tickLine={false}
                    width={60}
                />
                <ReferenceLine
                    label={{
                        fill: 'hsl(0 84% 60%)',
                        fontSize: 11,
                        position: 'right',
                        value: 'Bust limit',
                    }}
                    stroke="hsl(0 84% 60%)"
                    strokeDasharray="4 4"
                    y={drawdownLimit}
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
        for (const [i, series] of ddSeries.entries()) {
            const v = series[day];
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
