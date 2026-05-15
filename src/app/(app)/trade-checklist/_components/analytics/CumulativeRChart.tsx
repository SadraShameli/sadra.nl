'use client';

import { useMemo } from 'react';
import {
    CartesianGrid,
    Line,
    LineChart,
    ReferenceLine,
    XAxis,
    YAxis,
} from 'recharts';

import { type ChartConfig, ChartContainer } from '~/components/ui/Chart';
import {
    cumulativeRSeries,
    type LightAssessment,
} from '~/lib/trading-analytics';
import { cn } from '~/lib/utils';

const chartConfig: ChartConfig = {
    cumR: { color: 'hsl(var(--chart-1))', label: 'Cumulative R' },
};

export function CumulativeRChart({
    assessments,
}: {
    assessments: LightAssessment[];
}) {
    const data = useMemo(() => cumulativeRSeries(assessments), [assessments]);

    if (data.length === 0) {
        return (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                Record outcomes with R values to see the equity curve.
            </div>
        );
    }

    return (
        <ChartContainer
            className={cn(
                'app-trade-checklist__cumulative-chart',
                'aspect-16/7 min-h-72 w-full',
            )}
            config={chartConfig}
        >
            <LineChart
                data={data}
                margin={{ bottom: 24, left: 0, right: 12, top: 10 }}
            >
                <CartesianGrid stroke="#ccc" strokeDasharray="3 3" />
                <XAxis
                    axisLine={false}
                    dataKey="date"
                    tickFormatter={(v: string) => {
                        const d = new Date(v);
                        return `${d.getMonth() + 1}/${d.getDate()}`;
                    }}
                    tickLine={false}
                    tickMargin={6}
                />
                <YAxis
                    axisLine={false}
                    tickFormatter={(v: number) => `${v.toFixed(1)}R`}
                    tickLine={false}
                    width={48}
                />
                <ReferenceLine
                    stroke="hsl(0 0% 50%)"
                    strokeDasharray="4 4"
                    y={0}
                />
                <Line
                    dataKey="cumR"
                    dot={false}
                    isAnimationActive={false}
                    stroke="var(--color-cumR)"
                    strokeWidth={2}
                    type="monotone"
                />
            </LineChart>
        </ChartContainer>
    );
}
