'use client';

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import { type ChartConfig, ChartContainer } from '~/components/ui/Chart';
import { type SimOutputs } from '~/lib/prop-calculator';
import { cn } from '~/lib/utilities';

interface Properties {
    maxEvalDays: number;
    result: SimOutputs;
    totalTrials: number;
}

const chartConfig: ChartConfig = {
    passRate: { color: 'hsl(142 76% 45%)', label: 'Cumulative pass %' },
};

interface ChartRow {
    day: number;
    passRate: number;
}

export default function PassRateByDayChartView({
    maxEvalDays,
    result,
    totalTrials,
}: Properties) {
    if (result.daysToPassValues.length === 0) {
        return (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                No passing trials yet.
            </div>
        );
    }

    const data = buildPassRateCurve(
        result.daysToPassValues,
        totalTrials,
        maxEvalDays,
    );

    return (
        <ChartContainer
            className={cn(
                'app-prop-calculator__pass-rate-chart',
                'aspect-16/7 min-h-125 w-full',
            )}
            config={chartConfig}
        >
            <AreaChart
                data={data}
                margin={{ bottom: 28, left: 0, right: 12, top: 10 }}
            >
                <CartesianGrid stroke="#ccc" strokeDasharray="3 3" />
                <XAxis
                    axisLine={false}
                    dataKey="day"
                    label={{
                        fontSize: 11,
                        offset: 12,
                        position: 'bottom',
                        value: 'Trading day',
                    }}
                    tickLine={false}
                    tickMargin={6}
                />
                <YAxis
                    axisLine={false}
                    domain={[0, 1]}
                    tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                    tickLine={false}
                    width={50}
                />
                <Area
                    dataKey="passRate"
                    fill="var(--color-passRate)"
                    fillOpacity={0.18}
                    isAnimationActive={false}
                    stroke="var(--color-passRate)"
                    strokeWidth={2.5}
                    type="monotone"
                />
            </AreaChart>
        </ChartContainer>
    );
}

function buildPassRateCurve(
    daysToPassValues: readonly number[],
    totalTrials: number,
    maxDay: number,
): ChartRow[] {
    if (totalTrials === 0) return [];
    const counts = Array.from({ length: maxDay + 1 }, () => 0);
    for (const d of daysToPassValues) {
        const day = Math.max(0, Math.min(maxDay, Math.floor(d)));
        counts[day] = (counts[day] ?? 0) + 1;
    }
    const rows: ChartRow[] = [];
    let cum = 0;
    for (let day = 0; day <= maxDay; day++) {
        cum += counts[day] ?? 0;
        rows.push({ day, passRate: cum / totalTrials });
    }
    return rows;
}
