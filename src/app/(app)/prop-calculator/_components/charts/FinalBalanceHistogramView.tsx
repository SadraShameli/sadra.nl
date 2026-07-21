'use client';

import {
    Bar,
    BarChart,
    CartesianGrid,
    ReferenceLine,
    XAxis,
    YAxis,
} from 'recharts';

import { type ChartConfig, ChartContainer } from '~/components/ui/Chart';
import { formatCompactCurrency } from '~/lib/format';
import { type SimOutputs } from '~/lib/prop-calculator';
import { histogram } from '~/lib/prop-calculator/stats';
import { cn } from '~/lib/utilities';

interface Properties {
    result: SimOutputs;
}

const chartConfig: ChartConfig = {
    count: { color: 'hsl(var(--chart-1))', label: 'Trials' },
};

const BIN_COUNT = 30;

export default function FinalBalanceHistogramView({ result }: Properties) {
    if (result.finalBalances.length === 0) {
        return (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                No simulation data yet.
            </div>
        );
    }

    const bins = histogram(result.finalBalances, BIN_COUNT).map((b) => ({
        center: b.binCenter,
        count: b.count,
    }));
    const startingBalance = result.accountSize;
    const targetBalance = result.accountSize + result.profitTarget;

    return (
        <ChartContainer
            className={cn(
                'app-prop-calculator__final-balance-histogram',
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
                        value: 'Final balance',
                    }}
                    tickFormatter={(v: number) => formatCompactCurrency(v)}
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
                <ReferenceLine
                    label={{
                        fill: 'hsl(0 0% 70%)',
                        fontSize: 11,
                        position: 'top',
                        value: 'Start',
                    }}
                    stroke="hsl(0 0% 70%)"
                    strokeDasharray="4 4"
                    x={startingBalance}
                />
                <ReferenceLine
                    label={{
                        fill: 'hsl(142 76% 45%)',
                        fontSize: 11,
                        position: 'top',
                        value: 'Target',
                    }}
                    stroke="hsl(142 76% 45%)"
                    strokeDasharray="4 4"
                    x={targetBalance}
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
