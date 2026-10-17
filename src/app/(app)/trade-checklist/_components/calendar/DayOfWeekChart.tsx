'use client';

import { useMemo } from 'react';
import { Bar, BarChart, LabelList, XAxis, YAxis } from 'recharts';

import {
    CHART_X_AXIS_PROPS,
    CHART_Y_AXIS_PROPS,
    type ChartConfig,
    ChartContainer,
    ChartSize,
} from '~/components/ui/chart';
import { formatPercent } from '~/lib/format';
import { dayOfWeekStats, type LightAssessment } from '~/lib/trading/analytics';

const chartConfig: ChartConfig = {
    winRate: { color: 'var(--chart-1)', label: 'Win rate' },
};

export function DayOfWeekChart({
    assessments,
}: {
    assessments: LightAssessment[];
}) {
    const data = useMemo(
        () =>
            dayOfWeekStats(assessments).map((d) => ({
                ...d,
                fill: 'var(--chart-1)',
                fillOpacity: d.count < 3 ? 0.35 : 0.85,
            })),
        [assessments],
    );
    const hasData = data.some((d) => d.count > 0);

    return hasData ? (
        <ChartContainer
            className="app-trade-checklist__day-of-week-chart"
            config={chartConfig}
            size={ChartSize.Compact}
        >
            <BarChart
                data={data}
                margin={{ bottom: 24, left: 0, right: 12, top: 20 }}
            >
                <XAxis {...CHART_X_AXIS_PROPS} dataKey="label" />
                <YAxis
                    {...CHART_Y_AXIS_PROPS}
                    domain={[0, 1]}
                    tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                />
                <Bar dataKey="winRate" isAnimationActive={false}>
                    <LabelList
                        dataKey="count"
                        fill="var(--muted-foreground)"
                        fontSize={11}
                        formatter={(v: unknown) =>
                            typeof v === 'number' ? `n=${v}` : ''
                        }
                        position="top"
                    />
                    <LabelList
                        dataKey="winRate"
                        fill="var(--foreground)"
                        fontSize={11}
                        formatter={(v: unknown) =>
                            typeof v === 'number' ? formatPercent(v, 0) : ''
                        }
                        position="insideTop"
                    />
                </Bar>
            </BarChart>
        </ChartContainer>
    ) : (
        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            Record outcomes across weekdays to see day-of-week edge.
        </div>
    );
}
