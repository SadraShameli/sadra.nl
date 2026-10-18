'use client';

import { ChartColumn } from 'lucide-react';
import { useMemo } from 'react';
import { Bar, BarChart, XAxis, YAxis } from 'recharts';

import {
    WIN_RATE_CHART_TOP_MARGIN,
    WinRateBarLabels,
} from '~/app/(app)/trade-checklist/_components/analytics/WinRateBarLabels';
import {
    CHART_BAR_PROPS,
    CHART_X_AXIS_PROPS,
    CHART_Y_AXIS_PROPS,
    type ChartConfig,
    ChartContainer,
    ChartSize,
} from '~/components/ui/chart';
import { EmptyState } from '~/components/ui/empty-state';
import { dayOfWeekStats, type LightAssessment } from '~/lib/trading/analytics';

const chartConfig: ChartConfig = {
    winRate: { color: 'var(--chart-1)', label: 'Win rate' },
};

export function DayOfWeekChart({
    assessments,
}: {
    assessments: LightAssessment[];
}) {
    const data = useMemo(() => dayOfWeekStats(assessments), [assessments]);
    const hasData = data.some((d) => d.count > 0);

    return hasData ? (
        <ChartContainer
            className="app-trade-checklist__day-of-week-chart"
            config={chartConfig}
            size={ChartSize.Compact}
        >
            <BarChart
                data={data}
                margin={{
                    bottom: 24,
                    left: 0,
                    right: 12,
                    top: WIN_RATE_CHART_TOP_MARGIN,
                }}
            >
                <XAxis {...CHART_X_AXIS_PROPS} dataKey="label" />
                <YAxis
                    {...CHART_Y_AXIS_PROPS}
                    domain={[0, 1]}
                    tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                />
                <Bar
                    {...CHART_BAR_PROPS}
                    dataKey="winRate"
                    fill="var(--color-winRate)"
                >
                    <WinRateBarLabels />
                </Bar>
            </BarChart>
        </ChartContainer>
    ) : (
        <EmptyState
            description="Record outcomes across weekdays to see day-of-week edge."
            icon={ChartColumn}
            title="No outcomes yet"
        />
    );
}
