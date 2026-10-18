'use client';

import { ChartColumn } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
    Bar,
    BarChart,
    LabelList,
    ReferenceLine,
    XAxis,
    YAxis,
} from 'recharts';

import type { WeightCategory } from '~/lib/trading/types';

import { FilterToolbar } from '~/components/FilterToolbar';
import {
    CHART_BAR_PROPS,
    CHART_REFERENCE_LINE_PROPS,
    CHART_X_AXIS_PROPS,
    CHART_Y_AXIS_PROPS,
    type ChartConfig,
    ChartContainer,
} from '~/components/ui/chart';
import { EmptyState } from '~/components/ui/empty-state';
import { ToolbarSelect } from '~/components/ui/toolbar-select';
import {
    componentScoreCorrelation,
    type LightAssessment,
} from '~/lib/trading/analytics';
import { cn } from '~/lib/utilities';

const CATEGORIES: { key: WeightCategory; label: string }[] = [
    { key: 'mental', label: 'Mental state' },
    { key: 'context', label: 'Session context' },
    { key: 'bias', label: 'HTF bias' },
    { key: 'dol', label: 'Draw on liquidity' },
    { key: 'state', label: 'Market state' },
    { key: 'entry', label: 'Entry quality' },
    { key: 'sl', label: 'Stop protection' },
    { key: 'rr', label: 'Risk / reward' },
];

const chartConfig: ChartConfig = {
    avgR: { color: 'var(--chart-3)', label: 'Avg outcome R' },
};

export function ComponentCorrelationChart({
    assessments,
}: {
    assessments: LightAssessment[];
}) {
    const [category, setCategory] = useState<WeightCategory>('entry');

    const data = useMemo(
        () =>
            componentScoreCorrelation(assessments, category).map((d) => ({
                ...d,
                bucket: `${d.pctOfMax - 20}–${d.pctOfMax}%`,
                fill: d.avgR > 0 ? 'var(--success)' : 'var(--destructive)',
                fillOpacity: d.count < 3 ? 0.35 : 0.85,
            })),
        [assessments, category],
    );

    const totalWithData = data.reduce((s, d) => s + d.count, 0);

    return (
        <div
            className={cn(
                'app-trade-checklist__correlation-chart',
                'flex flex-col gap-3',
            )}
        >
            <FilterToolbar label="Correlation component">
                <ToolbarSelect
                    label="Component"
                    onValueChange={(v) => {
                        const next = CATEGORIES.find((c) => c.key === v);
                        if (next) setCategory(next.key);
                    }}
                    options={CATEGORIES.map((c) => ({
                        label: c.label,
                        value: c.key,
                    }))}
                    value={category}
                />
            </FilterToolbar>

            {totalWithData === 0 ? (
                <EmptyState
                    description="Grade more setups with recorded outcomes to compare this component."
                    icon={ChartColumn}
                    title="Not enough outcomes yet"
                />
            ) : (
                <ChartContainer config={chartConfig}>
                    <BarChart
                        data={data}
                        margin={{ bottom: 36, left: 0, right: 12, top: 20 }}
                    >
                        <XAxis {...CHART_X_AXIS_PROPS} dataKey="bucket" />
                        <YAxis
                            {...CHART_Y_AXIS_PROPS}
                            tickFormatter={(v: number) => `${v.toFixed(1)}R`}
                        />
                        <ReferenceLine
                            {...CHART_REFERENCE_LINE_PROPS}
                            stroke="var(--muted-foreground)"
                            y={0}
                        />
                        <Bar {...CHART_BAR_PROPS} dataKey="avgR">
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
            )}
        </div>
    );
}
