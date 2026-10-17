'use client';

import { useMemo } from 'react';
import { Bar, BarChart, LabelList, XAxis, YAxis } from 'recharts';

import {
    CHART_X_AXIS_PROPS,
    CHART_Y_AXIS_PROPS,
    type ChartConfig,
    ChartContainer,
} from '~/components/ui/Chart';
import { formatPercent } from '~/lib/format';
import { type LightAssessment, perWindowStats } from '~/lib/trading/analytics';

const chartConfig: ChartConfig = {
    winRate: { color: 'var(--chart-1)', label: 'Win rate' },
};

export function PerWindowChart({
    assessments,
}: {
    assessments: LightAssessment[];
}) {
    const data = useMemo(
        () =>
            perWindowStats(assessments)
                .filter((d) => d.count > 0)
                .map((d) => ({
                    ...d,
                    fill: 'var(--chart-1)',
                    fillOpacity: d.count < 3 ? 0.35 : 0.85,
                })),
        [assessments],
    );

    return data.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            Take trades inside macro windows with recorded outcomes to see
            per-window performance.
        </div>
    ) : (
        <ChartContainer
            className="app-trade-checklist__per-window-chart"
            config={chartConfig}
        >
            <BarChart
                data={data}
                margin={{ bottom: 36, left: 0, right: 12, top: 20 }}
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
    );
}
