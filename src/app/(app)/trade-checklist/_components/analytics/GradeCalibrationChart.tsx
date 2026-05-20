'use client';

import { useMemo } from 'react';
import {
    Bar,
    BarChart,
    Cell,
    LabelList,
    ReferenceLine,
    XAxis,
    YAxis,
} from 'recharts';

import { type ChartConfig, ChartContainer } from '~/components/ui/Chart';
import {
    gradeCalibration,
    type LightAssessment,
} from '~/lib/trading/analytics';
import { cn } from '~/lib/utils';

const chartConfig: ChartConfig = {
    avgR: { color: 'hsl(var(--chart-2))', label: 'Avg outcome R' },
};

export function GradeCalibrationChart({
    assessments,
}: {
    assessments: LightAssessment[];
}) {
    const data = useMemo(
        () => gradeCalibration(assessments).filter((d) => d.count > 0),
        [assessments],
    );

    if (data.length === 0) {
        return (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                Record outcome R values to see if A grades actually outperform
                B.
            </div>
        );
    }

    return (
        <ChartContainer
            className={cn(
                'app-trade-checklist__grade-calibration-chart',
                'aspect-16/7 min-h-80 w-full',
            )}
            config={chartConfig}
        >
            <BarChart
                data={data}
                margin={{ bottom: 36, left: 0, right: 12, top: 20 }}
            >
                <XAxis
                    axisLine={false}
                    dataKey="grade"
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
                <Bar dataKey="avgR" isAnimationActive={false}>
                    {data.map((d) => (
                        // eslint-disable-next-line @typescript-eslint/no-deprecated
                        <Cell
                            fill={
                                d.avgR > 0
                                    ? 'hsl(142 71% 45%)'
                                    : 'hsl(0 84% 60%)'
                            }
                            fillOpacity={d.count < 3 ? 0.35 : 0.85}
                            key={d.grade}
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
                </Bar>
            </BarChart>
        </ChartContainer>
    );
}
