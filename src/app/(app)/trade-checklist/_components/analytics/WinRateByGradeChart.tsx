'use client';

import { ChartColumn } from 'lucide-react';
import { useMemo } from 'react';
import { Bar, BarChart, LabelList, XAxis, YAxis } from 'recharts';

import {
    CHART_BAR_PROPS,
    CHART_X_AXIS_PROPS,
    CHART_Y_AXIS_PROPS,
    type ChartConfig,
    ChartContainer,
} from '~/components/ui/chart';
import { EmptyState } from '~/components/ui/empty-state';
import { formatPercent } from '~/lib/format';
import { type LightAssessment, winRateByGrade } from '~/lib/trading/analytics';

const chartConfig: ChartConfig = {
    winRate: { color: 'var(--chart-1)', label: 'Win rate' },
};

export function WinRateByGradeChart({
    assessments,
}: {
    assessments: LightAssessment[];
}) {
    const data = useMemo(() => {
        return winRateByGrade(assessments)
            .filter((d) => d.count > 0)
            .map((d) => ({
                ...d,
                fill: gradeColor(d.grade),
                fillOpacity: d.count < 3 ? 0.35 : 0.85,
            }));
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
                margin={{ bottom: 36, left: 0, right: 12, top: 20 }}
            >
                <XAxis {...CHART_X_AXIS_PROPS} dataKey="grade" />
                <YAxis
                    {...CHART_Y_AXIS_PROPS}
                    domain={[0, 1]}
                    tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                />
                <Bar {...CHART_BAR_PROPS} dataKey="winRate">
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

function gradeColor(grade: string): string {
    if (grade.startsWith('A')) return 'var(--success)';
    if (grade.startsWith('B')) return 'var(--warning)';
    return grade.startsWith('C') ? 'var(--warning)' : 'var(--destructive)';
}
