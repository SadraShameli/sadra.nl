'use client';

import {
    Bar,
    BarChart,
    CartesianGrid,
    ReferenceLine,
    XAxis,
    YAxis,
} from 'recharts';

import { type ChartConfig, ChartContainer } from '~/components/ui/Chart';
import { histogram } from '~/lib/prop-calculator/stats';
import { cn } from '~/lib/utilities';

interface HistogramChartViewProperties {
    aspectClassName: string;
    barColor: string;
    barLabel: string;
    binCount: number;
    emptyMessage: string;
    referenceLines?: readonly HistogramReferenceLine[];
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
    aspectClassName,
    barColor,
    barLabel,
    binCount,
    emptyMessage,
    referenceLines = [],
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
            className={cn(wrapperClassName, aspectClassName)}
            config={chartConfig}
        >
            <BarChart
                data={bins}
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
                        value: xAxisLabel,
                    }}
                    tickFormatter={xAxisTickFormatter}
                    tickLine={false}
                    tickMargin={6}
                />
                <YAxis
                    axisLine={false}
                    label={{
                        angle: -90,
                        fontSize: 11,
                        position: 'insideLeft',
                        value: 'Trials',
                    }}
                    tickLine={false}
                    width={40}
                />
                {referenceLines.map((line) => (
                    <ReferenceLine
                        key={line.label}
                        label={{
                            fill: line.color,
                            fontSize: 11,
                            position: 'top',
                            value: line.label,
                        }}
                        stroke={line.color}
                        strokeDasharray="4 4"
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
