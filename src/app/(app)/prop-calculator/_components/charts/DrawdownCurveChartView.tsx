'use client';

import { Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts';

import {
    CHART_REFERENCE_LINE_PROPS,
    CHART_STROKE_WIDTH,
    CHART_X_AXIS_PROPS,
    CHART_Y_AXIS_PROPS,
    type ChartConfig,
    ChartContainer,
    ChartSize,
} from '~/components/ui/chart';
import { formatCompactCurrency } from '~/lib/format';
import { type SimOutputs } from '~/lib/prop-calculator';
import { median } from '~/lib/prop-calculator/stats';

import { type SampledPathChartRow } from './types';

interface Properties {
    result: SimOutputs;
}

const chartConfig: ChartConfig = {
    median: { color: 'var(--destructive)', label: 'Median drawdown' },
    sample: { color: 'var(--destructive)', label: 'Sample drawdown' },
};

export default function DrawdownCurveChartView({ result }: Properties) {
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
            className="app-prop-calculator__drawdown-curve-chart"
            config={chartConfig}
            size={ChartSize.Tall}
        >
            <LineChart
                data={data}
                margin={{ bottom: 28, left: 0, right: 12, top: 10 }}
            >
                <XAxis
                    {...CHART_X_AXIS_PROPS}
                    dataKey="day"
                    label={{
                        fontSize: 11,
                        offset: 12,
                        position: 'bottom',
                        value: 'Trading day',
                    }}
                />
                <YAxis
                    {...CHART_Y_AXIS_PROPS}
                    domain={[0, 'auto']}
                    reversed
                    tickFormatter={(v: number) =>
                        `-${formatCompactCurrency(v)}`
                    }
                />
                <ReferenceLine
                    {...CHART_REFERENCE_LINE_PROPS}
                    label={{
                        fill: 'var(--destructive)',
                        fontSize: 11,
                        position: 'right',
                        value: 'Bust limit',
                    }}
                    stroke="var(--destructive)"
                    y={drawdownLimit}
                />
                {Array.from({ length: pathCount }, (_, index) => (
                    <Line
                        connectNulls={false}
                        dataKey={`p${index}`}
                        dot={false}
                        isAnimationActive={false}
                        key={index}
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
                    strokeWidth={CHART_STROKE_WIDTH}
                    type="monotone"
                />
            </LineChart>
        </ChartContainer>
    );
}

function buildDrawdownData(curves: readonly number[][]): SampledPathChartRow[] {
    if (curves.length === 0) return [];
    let maxLength = 0;
    for (const c of curves) if (c.length > maxLength) maxLength = c.length;

    const ddSeries = curves.map((curve) => {
        const out: number[] = [];
        let peak = curve[0] ?? 0;
        for (const v of curve) {
            if (v > peak) peak = v;
            out.push(peak - v);
        }
        return out;
    });

    const rows: SampledPathChartRow[] = [];
    for (let day = 0; day < maxLength; day++) {
        const row: SampledPathChartRow = { day, median: null };
        const valuesAtDay: number[] = [];
        for (const [index, series] of ddSeries.entries()) {
            const v = series[day];
            row[`p${index}`] = v ?? null;
            if (v !== undefined) valuesAtDay.push(v);
        }
        if (valuesAtDay.length > 0) {
            row.median = median(valuesAtDay);
        }
        rows.push(row);
    }
    return rows;
}
