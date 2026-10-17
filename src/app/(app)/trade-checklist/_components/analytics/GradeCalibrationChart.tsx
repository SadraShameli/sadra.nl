'use client';

import { useMemo } from 'react';
import {
    Bar,
    BarChart,
    LabelList,
    ReferenceLine,
    XAxis,
    YAxis,
} from 'recharts';

import {
    CHART_REFERENCE_LINE_PROPS,
    CHART_X_AXIS_PROPS,
    CHART_Y_AXIS_PROPS,
    type ChartConfig,
    ChartContainer,
} from '~/components/ui/chart';
import {
    gradeCalibration,
    type LightAssessment,
} from '~/lib/trading/analytics';

const chartConfig: ChartConfig = {
    avgR: { color: 'var(--chart-2)', label: 'Avg outcome R' },
};

export function GradeCalibrationChart({
    assessments,
}: {
    assessments: LightAssessment[];
}) {
    const data = useMemo(
        () =>
            gradeCalibration(assessments)
                .filter((d) => d.count > 0)
                .map((d) => ({
                    ...d,
                    fill: d.avgR > 0 ? 'var(--success)' : 'var(--destructive)',
                    fillOpacity: d.count < 3 ? 0.35 : 0.85,
                })),
        [assessments],
    );

    return data.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            Record outcome R values to see if A grades actually outperform B.
        </div>
    ) : (
        <ChartContainer
            className="app-trade-checklist__grade-calibration-chart"
            config={chartConfig}
        >
            <BarChart
                data={data}
                margin={{ bottom: 36, left: 0, right: 12, top: 20 }}
            >
                <XAxis {...CHART_X_AXIS_PROPS} dataKey="grade" />
                <YAxis
                    {...CHART_Y_AXIS_PROPS}
                    tickFormatter={(v: number) => `${v.toFixed(1)}R`}
                />
                <ReferenceLine
                    {...CHART_REFERENCE_LINE_PROPS}
                    stroke="var(--muted-foreground)"
                    y={0}
                />
                <Bar dataKey="avgR" isAnimationActive={false}>
                    <LabelList
                        dataKey="count"
                        fill="var(--muted-foreground)"
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
