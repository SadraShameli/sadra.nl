'use client';

import {
    Bar,
    BarChart,
    CartesianGrid,
    ReferenceLine,
    XAxis,
    YAxis,
} from 'recharts';

import { type SimOutputs } from '~/lib/prop-calculator';
import { histogram } from '~/lib/prop-calculator/stats';

import { type ChartConfig, ChartContainer } from '~/components/ui/Chart';

import { formatCompactCurrency } from '../helpers';

interface Props {
    result: SimOutputs;
}

const chartConfig: ChartConfig = {
    count: { label: 'Trials', color: 'hsl(var(--chart-1))' },
};

const BIN_COUNT = 30;

export default function FinalBalanceHistogramView({ result }: Props) {
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
            config={chartConfig}
            className="aspect-16/7 min-h-125 w-full"
        >
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
                    tickFormatter={(v: number) => formatCompactCurrency(v)}
                    label={{
                        value: 'Final balance',
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
                <ReferenceLine
                    x={startingBalance}
                    stroke="hsl(0 0% 70%)"
                    strokeDasharray="4 4"
                    label={{
                        value: 'Start',
                        position: 'top',
                        fill: 'hsl(0 0% 70%)',
                        fontSize: 11,
                    }}
                />
                <ReferenceLine
                    x={targetBalance}
                    stroke="hsl(142 76% 45%)"
                    strokeDasharray="4 4"
                    label={{
                        value: 'Target',
                        position: 'top',
                        fill: 'hsl(142 76% 45%)',
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
