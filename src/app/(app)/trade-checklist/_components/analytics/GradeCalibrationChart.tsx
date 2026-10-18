'use client';

import { ChartColumn } from 'lucide-react';
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
    CHART_BAR_PROPS,
    CHART_REFERENCE_LINE_PROPS,
    CHART_X_AXIS_PROPS,
    CHART_Y_AXIS_PROPS,
    type ChartConfig,
    ChartContainer,
} from '~/components/ui/chart';
import { EmptyState } from '~/components/ui/empty-state';
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
        () => gradeCalibration(assessments).filter((d) => d.count > 0),
        [assessments],
    );

    return data.length === 0 ? (
        <EmptyState
            description="Record outcome R values to see if A grades actually outperform B."
            icon={ChartColumn}
            title="No outcomes yet"
        />
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
                <Bar
                    {...CHART_BAR_PROPS}
                    dataKey="avgR"
                    fill="var(--color-avgR)"
                >
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
