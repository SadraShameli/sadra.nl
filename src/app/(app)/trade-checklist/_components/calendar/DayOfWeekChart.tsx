'use client';

import { useMemo } from 'react';
import { Bar, BarChart, LabelList, XAxis, YAxis } from 'recharts';

import { type ChartConfig, ChartContainer } from '~/components/ui/Chart';
import { formatPercent } from '~/lib/format';
import { dayOfWeekStats, type LightAssessment } from '~/lib/trading/analytics';
import { cn } from '~/lib/utils';

const chartConfig: ChartConfig = {
    winRate: { color: 'hsl(var(--chart-1))', label: 'Win rate' },
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
                fill: 'hsl(var(--chart-1))',
                fillOpacity: d.count < 3 ? 0.35 : 0.85,
            })),
        [assessments],
    );
    const hasData = data.some((d) => d.count > 0);

    if (!hasData) {
        return (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                Record outcomes across weekdays to see day-of-week edge.
            </div>
        );
    }

    return (
        <ChartContainer
            className={cn(
                'app-trade-checklist__day-of-week-chart',
                'aspect-16/6 min-h-56 w-full',
            )}
            config={chartConfig}
        >
            <BarChart
                data={data}
                margin={{ bottom: 24, left: 0, right: 12, top: 20 }}
            >
                <XAxis
                    axisLine={false}
                    dataKey="label"
                    tickLine={false}
                    tickMargin={6}
                />
                <YAxis
                    axisLine={false}
                    domain={[0, 1]}
                    tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                    tickLine={false}
                    width={42}
                />
                <Bar dataKey="winRate" isAnimationActive={false}>
                    <LabelList
                        dataKey="count"
                        fill="hsl(0 0% 70%)"
                        fontSize={11}
                        formatter={(v: unknown) =>
                            typeof v === 'number' ? `n=${v}` : ''
                        }
                        position="top"
                    />
                    <LabelList
                        dataKey="winRate"
                        fill="hsl(0 0% 95%)"
                        fontSize={11}
                        formatter={(v: unknown) =>
                            typeof v === 'number' ? formatPercent(v, 0) : ''
                        }
                        position="insideTop"
                    />
                </Bar>
            </BarChart>
        </ChartContainer>
    );
}
