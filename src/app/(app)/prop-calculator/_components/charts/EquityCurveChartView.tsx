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

import { ChartEmptyState } from './ChartEmptyState';
import { type SampledPathChartRow } from './types';

interface Properties {
    result: SimOutputs;
}

const chartConfig: ChartConfig = {
    median: { color: 'var(--chart-1)', label: 'Median path' },
    sample: { color: 'var(--chart-2)', label: 'Sample path' },
};

export default function EquityCurveChartView({ result }: Properties) {
    if (result.sampleEquityCurves.length === 0) {
        return <ChartEmptyState title="No simulation data yet" />;
    }

    const data = buildChartData(result.sampleEquityCurves);
    const targetLine = result.accountSize + result.profitTarget;
    const drawdownLine = result.initialThreshold;
    const pathCount = result.sampleEquityCurves.length;

    return (
        <ChartContainer
            className="app-prop-calculator__equity-curve-chart"
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
                    domain={['auto', 'auto']}
                    tickFormatter={(v: number) => formatCompactCurrency(v)}
                />
                <ReferenceLine
                    {...CHART_REFERENCE_LINE_PROPS}
                    label={{
                        fill: 'var(--success)',
                        fontSize: 11,
                        position: 'right',
                        value: 'Target',
                    }}
                    stroke="var(--success)"
                    y={targetLine}
                />
                <ReferenceLine
                    {...CHART_REFERENCE_LINE_PROPS}
                    label={{
                        fill: 'var(--destructive)',
                        fontSize: 11,
                        position: 'right',
                        value: 'Drawdown',
                    }}
                    stroke="var(--destructive)"
                    y={drawdownLine}
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

function buildChartData(curves: readonly number[][]): SampledPathChartRow[] {
    if (curves.length === 0) return [];
    let maxLength = 0;
    for (const c of curves) if (c.length > maxLength) maxLength = c.length;

    const rows: SampledPathChartRow[] = [];
    for (let day = 0; day < maxLength; day++) {
        const row: SampledPathChartRow = { day, median: null };
        const valuesAtDay: number[] = [];
        for (const [index, curve] of curves.entries()) {
            const v = curve[day];
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
