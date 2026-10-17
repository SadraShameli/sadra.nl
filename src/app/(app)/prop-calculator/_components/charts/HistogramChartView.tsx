'use client';

import { Bar, BarChart, ReferenceLine, XAxis, YAxis } from 'recharts';

import {
    CHART_REFERENCE_LINE_PROPS,
    CHART_X_AXIS_PROPS,
    CHART_Y_AXIS_PROPS,
    type ChartConfig,
    ChartContainer,
    type ChartSize,
} from '~/components/ui/Chart';
import { histogram } from '~/lib/prop-calculator/stats';

interface HistogramChartViewProperties {
    barColor: string;
    barLabel: string;
    binCount: number;
    emptyMessage: string;
    referenceLines?: readonly HistogramReferenceLine[];
    size: ChartSize;
    values: readonly number[];
    wrapperClassName: string;
    xAxisLabel: string;
    xAxisTickFormatter: (value: number) => string;
}

interface HistogramReferenceLine {
    color: string;
    label: string;
    x: number;
}

interface HistogramRow {
    center: number;
    count: number;
}

export default function HistogramChartView({
    barColor,
    barLabel,
    binCount,
    emptyMessage,
    referenceLines = [],
    size,
    values,
    wrapperClassName,
    xAxisLabel,
    xAxisTickFormatter,
}: HistogramChartViewProperties) {
    if (values.length === 0) {
        return (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                {emptyMessage}
            </div>
        );
    }

    const bins: HistogramRow[] = histogram(values, binCount).map((b) => ({
        center: b.binCenter,
        count: b.count,
    }));

    const chartConfig: ChartConfig = {
        count: { color: barColor, label: barLabel },
    };

    return (
        <ChartContainer
            className={wrapperClassName}
            config={chartConfig}
            size={size}
        >
            <BarChart
                data={bins}
                margin={{ bottom: 28, left: 0, right: 12, top: 10 }}
            >
                <XAxis
                    {...CHART_X_AXIS_PROPS}
                    dataKey="center"
                    label={{
                        fontSize: 11,
                        offset: 12,
                        position: 'bottom',
                        value: xAxisLabel,
                    }}
                    tickFormatter={xAxisTickFormatter}
                />
                <YAxis
                    {...CHART_Y_AXIS_PROPS}
                    label={{
                        angle: -90,
                        fontSize: 11,
                        position: 'insideLeft',
                        value: 'Trials',
                    }}
                />
                {referenceLines.map((line) => (
                    <ReferenceLine
                        {...CHART_REFERENCE_LINE_PROPS}
                        key={line.label}
                        label={{
                            fill: line.color,
                            fontSize: 11,
                            position: 'top',
                            value: line.label,
                        }}
                        stroke={line.color}
                        x={line.x}
                    />
                ))}
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
