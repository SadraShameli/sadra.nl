'use client';

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

import { type ChartConfig, ChartContainer } from '~/components/ui/Chart';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
import {
    componentScoreCorrelation,
    type LightAssessment,
} from '~/lib/trading/analytics';
import { cn } from '~/lib/utils';

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
    avgR: { color: 'hsl(var(--chart-3))', label: 'Avg outcome R' },
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
                fill: d.avgR > 0 ? 'hsl(142 71% 45%)' : 'hsl(0 84% 60%)',
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
            <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs tracking-wider text-muted-foreground uppercase">
                    Component
                </span>
                <Select
                    onValueChange={(v) => setCategory(v as WeightCategory)}
                    value={category}
                >
                    <SelectTrigger className="w-56">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {CATEGORIES.map((c) => (
                            <SelectItem key={c.key} value={c.key}>
                                {c.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">
                    Bucketed by % of component max earned. Higher buckets should
                    produce higher avg R if the section has edge.
                </span>
            </div>

            {totalWithData === 0 ? (
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                    Not enough graded outcomes for this component yet.
                </div>
            ) : (
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
                            dataKey="bucket"
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
            )}
        </div>
    );
}
