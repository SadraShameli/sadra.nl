'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import { type ChartConfig, ChartContainer } from '~/components/ui/Chart';
import { type SimOutputs } from '~/lib/prop-calculator';
import { histogram } from '~/lib/prop-calculator/stats';
import { cn } from '~/lib/utils';

interface Properties {
    result: SimOutputs;
}

const chartConfig: ChartConfig = {
    count: { color: 'hsl(142 76% 45%)', label: 'Passing trials' },
};

const BIN_COUNT = 20;

export default function DaysToPassHistogramView({ result }: Properties) {
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
        <ChartContainer
            className={cn(
                'app-prop-calculator__days-to-pass-histogram',
                'aspect-16/7 min-h-125 w-full',
            )}
            config={chartConfig}
        >
            <BarChart
                data={bins}
                margin={{ bottom: 28, left: 0, right: 12, top: 10 }}
            >
                <CartesianGrid stroke="#ccc" strokeDasharray="3 3" />
                <XAxis
                    axisLine={false}
                    dataKey="center"
                    label={{
                        fontSize: 11,
                        offset: 12,
                        position: 'bottom',
                        value: 'Days to pass',
                    }}
                    tickFormatter={(v: number) => v.toFixed(0)}
                    tickLine={false}
                    tickMargin={6}
                />
                <YAxis
                    axisLine={false}
                    label={{
                        angle: -90,
                        fontSize: 11,
                        position: 'insideLeft',
                        value: 'Trials',
                    }}
                    tickLine={false}
                    width={40}
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
