'use client';

import {
    Area,
    AreaChart,
    CartesianGrid,
    XAxis,
    YAxis,
} from 'recharts';

import { type SimOutputs } from '~/lib/prop-calculator';

import { type ChartConfig, ChartContainer } from '~/components/ui/Chart';

interface Props {
    result: SimOutputs;
    totalTrials: number;
    maxEvalDays: number;
}

const chartConfig: ChartConfig = {
    passRate: { label: 'Cumulative pass %', color: 'hsl(142 76% 45%)' },
};

interface ChartRow {
    day: number;
    passRate: number;
}

function buildPassRateCurve(
    daysToPassValues: readonly number[],
    totalTrials: number,
    maxDay: number,
): ChartRow[] {
    if (totalTrials === 0) return [];
    const counts = new Array<number>(maxDay + 1).fill(0);
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

export default function PassRateByDayChartView({
    result,
    totalTrials,
    maxEvalDays,
}: Props) {
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
        <ChartContainer config={chartConfig} className="aspect-16/7 w-full">
            <AreaChart
                data={data}
                margin={{ top: 10, right: 12, left: 0, bottom: 28 }}
            >
                <CartesianGrid strokeDasharray="3 3" stroke="#ccc" />
                <XAxis
                    dataKey="day"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={6}
                    label={{
                        value: 'Trading day',
                        position: 'bottom',
                        offset: 12,
                        fontSize: 11,
                    }}
                />
                <YAxis
                    tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                    tickLine={false}
                    axisLine={false}
                    width={50}
                    domain={[0, 1]}
                />
                <Area
                    type="monotone"
                    dataKey="passRate"
                    stroke="var(--color-passRate)"
                    fill="var(--color-passRate)"
                    fillOpacity={0.18}
                    strokeWidth={2.5}
                    isAnimationActive={false}
                />
            </AreaChart>
        </ChartContainer>
    );
}
