'use client';

import { ChartColumn } from 'lucide-react';
import { useMemo } from 'react';
import { Bar, BarChart, XAxis, YAxis } from 'recharts';

import {
    CHART_BAR_PROPS,
    CHART_X_AXIS_PROPS,
    CHART_Y_AXIS_PROPS,
    type ChartConfig,
    ChartContainer,
} from '~/components/ui/chart';
import { EmptyState } from '~/components/ui/empty-state';
import { type LightAssessment, winRateByGrade } from '~/lib/trading/analytics';

import {
    WIN_RATE_CHART_TOP_MARGIN,
    WinRateBarLabels,
} from './WinRateBarLabels';

const chartConfig: ChartConfig = {
    winRate: { color: 'var(--chart-1)', label: 'Win rate' },
};

export function WinRateByGradeChart({
    assessments,
}: {
    assessments: LightAssessment[];
}) {
    const data = useMemo(() => {
        return winRateByGrade(assessments).filter((d) => d.count > 0);
    }, [assessments]);

    return data.length === 0 ? (
        <EmptyState
            description="Record win, loss or breakeven outcomes to see win rate per grade."
            icon={ChartColumn}
            title="No outcomes yet"
        />
    ) : (
        <ChartContainer
            className="app-trade-checklist__win-rate-chart"
            config={chartConfig}
        >
            <BarChart
                data={data}
                margin={{
                    bottom: 36,
                    left: 0,
                    right: 12,
                    top: WIN_RATE_CHART_TOP_MARGIN,
                }}
            >
                <XAxis {...CHART_X_AXIS_PROPS} dataKey="grade" />
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
    );
}
