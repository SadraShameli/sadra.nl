'use client';

import { useMemo } from 'react';
import { Pie, PieChart } from 'recharts';

import { type ChartConfig, ChartContainer } from '~/components/ui/Chart';
import {
    type LightAssessment,
    outcomeDistribution,
} from '~/lib/trading/analytics';
import { cn } from '~/lib/utils';

const COLORS: Record<string, string> = {
    breakeven: 'hsl(45 93% 47%)',
    loss: 'hsl(0 84% 60%)',
    'no-trade': 'hsl(0 0% 50%)',
    win: 'hsl(142 71% 45%)',
};

const LABELS: Record<string, string> = {
    breakeven: 'BE',
    loss: 'Loss',
    'no-trade': 'Skipped',
    win: 'Win',
};

const chartConfig: ChartConfig = {
    breakeven: { color: COLORS.breakeven, label: 'Breakeven' },
    loss: { color: COLORS.loss, label: 'Loss' },
    'no-trade': { color: COLORS['no-trade'], label: 'No trade' },
    win: { color: COLORS.win, label: 'Win' },
};

export function OutcomeDonut({
    assessments,
}: {
    assessments: LightAssessment[];
}) {
    const data = useMemo(
        () =>
            outcomeDistribution(assessments)
                .filter((d) => d.count > 0)
                .map((d) => ({ ...d, fill: COLORS[d.outcome] })),
        [assessments],
    );

    if (data.length === 0) {
        return (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                No recorded outcomes yet.
            </div>
        );
    }

    return (
        <div
            className={cn(
                'app-trade-checklist__outcome-donut',
                'flex flex-col items-center gap-4',
            )}
        >
            <ChartContainer className="size-56 shrink-0" config={chartConfig}>
                <PieChart>
                    <Pie
                        cx="50%"
                        cy="50%"
                        data={data}
                        dataKey="count"
                        innerRadius={60}
                        isAnimationActive={false}
                        nameKey="outcome"
                        outerRadius={100}
                        paddingAngle={2}
                    />
                </PieChart>
            </ChartContainer>
            <ul className="flex flex-1 flex-col gap-2 text-sm">
                {data.map((d) => (
                    <li
                        className={cn(
                            'app-trade-checklist__outcome-donut-item',
                            'flex items-center justify-between gap-3',
                        )}
                        key={d.outcome}
                    >
                        <span className="flex items-center gap-2">
                            <span
                                className="size-3 rounded-sm"
                                style={{ backgroundColor: COLORS[d.outcome] }}
                            />
                            {LABELS[d.outcome]}
                        </span>
                        <span className="font-mono text-muted-foreground">
                            {d.count} · {(d.share * 100).toFixed(0)}%
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
