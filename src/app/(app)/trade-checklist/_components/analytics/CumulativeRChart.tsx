'use client';

import { useMemo } from 'react';
import { Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts';

import {
    CHART_REFERENCE_LINE_PROPS,
    CHART_STROKE_WIDTH,
    CHART_X_AXIS_PROPS,
    CHART_Y_AXIS_PROPS,
    type ChartConfig,
    ChartContainer,
} from '~/components/ui/chart';
import { formatDisplayDate } from '~/lib/format';
import {
    cumulativeRSeries,
    type LightAssessment,
} from '~/lib/trading/analytics';

const chartConfig: ChartConfig = {
    cumR: { color: 'var(--chart-1)', label: 'Cumulative R' },
};

export function CumulativeRChart({
    assessments,
}: {
    assessments: LightAssessment[];
}) {
    const data = useMemo(() => cumulativeRSeries(assessments), [assessments]);

    return data.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            Record outcomes with R values to see the equity curve.
        </div>
    ) : (
        <ChartContainer
            className="app-trade-checklist__cumulative-chart"
            config={chartConfig}
        >
            <LineChart
                data={data}
                margin={{ bottom: 24, left: 0, right: 12, top: 10 }}
            >
                <XAxis
                    {...CHART_X_AXIS_PROPS}
                    dataKey="date"
                    tickFormatter={(v: string) => formatDisplayDate(v)}
                />
                <YAxis
                    {...CHART_Y_AXIS_PROPS}
                    tickFormatter={(v: number) => `${v.toFixed(1)}R`}
                />
                <ReferenceLine
                    {...CHART_REFERENCE_LINE_PROPS}
                    stroke="var(--muted-foreground)"
                    y={0}
                />
                <Line
                    dataKey="cumR"
                    dot={false}
                    isAnimationActive={false}
                    stroke="var(--color-cumR)"
                    strokeWidth={CHART_STROKE_WIDTH}
                    type="monotone"
                />
            </LineChart>
        </ChartContainer>
    );
}
