'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import { type SimOutputs } from '~/lib/prop-calculator';
import { histogram } from '~/lib/prop-calculator/stats';

import { type ChartConfig, ChartContainer } from '~/components/ui/Chart';

interface Props {
    result: SimOutputs;
}

const chartConfig: ChartConfig = {
    count: { label: 'Passing trials', color: 'hsl(142 76% 45%)' },
};

const BIN_COUNT = 20;

export default function DaysToPassHistogramView({ result }: Props) {
    if (result.daysToPassValues.length === 0) {
        return (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                No passing trials yet.
            </div>
        );
    }

    const bins = histogram(result.daysToPassValues, BIN_COUNT).map((b) => ({
        center: b.binCenter,
        count: b.count,
    }));

    return (
        <ChartContainer config={chartConfig} className="aspect-16/7 w-full">
            <BarChart
                data={bins}
                margin={{ top: 10, right: 12, left: 0, bottom: 28 }}
            >
                <CartesianGrid strokeDasharray="3 3" stroke="#ccc" />
                <XAxis
                    dataKey="center"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={6}
                    tickFormatter={(v: number) => `${v.toFixed(0)}`}
                    label={{
                        value: 'Days to pass',
                        position: 'bottom',
                        offset: 12,
                        fontSize: 11,
                    }}
                />
                <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    label={{
                        value: 'Trials',
                        angle: -90,
                        position: 'insideLeft',
                        fontSize: 11,
                    }}
                />
                <Bar
                    dataKey="count"
                    fill="var(--color-count)"
                    fillOpacity={0.75}
                    isAnimationActive={false}
                />
            </BarChart>
        </ChartContainer>
    );
}
