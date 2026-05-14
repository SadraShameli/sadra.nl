'use client';

import { useMemo } from 'react';
import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from 'recharts';

import { type ChartConfig, ChartContainer } from '~/components/ui/Chart';
import { formatPercent } from '~/lib/format';
import { type LightAssessment, perWindowStats } from '~/lib/trading-analytics';

const chartConfig: ChartConfig = {
    winRate: { color: 'hsl(var(--chart-1))', label: 'Win rate' },
};

export function PerWindowChart({
    assessments,
}: {
    assessments: LightAssessment[];
}) {
    const data = useMemo(
        () => perWindowStats(assessments).filter((d) => d.count > 0),
        [assessments],
    );

    if (data.length === 0) {
        return (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                Take trades inside macro windows with recorded outcomes to see
                per-window performance.
            </div>
        );
    }

    return (
        <ChartContainer
            className="aspect-16/7 min-h-72 w-full"
            config={chartConfig}
        >
            <BarChart
                data={data}
                margin={{ bottom: 36, left: 0, right: 12, top: 20 }}
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
                    {data.map((d) => (
                        // eslint-disable-next-line @typescript-eslint/no-deprecated
                        <Cell
                            fill="hsl(var(--chart-1))"
                            fillOpacity={d.count < 3 ? 0.35 : 0.85}
                            key={d.windowId}
                        />
                    ))}
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
