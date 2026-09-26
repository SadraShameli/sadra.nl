'use client';

import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts';

import { type ChartConfig, ChartContainer } from '~/components/ui/Chart';
import { formatCompactCurrency } from '~/lib/format';
import { cn } from '~/lib/utilities';

import { type StatementChartPoint } from './overviewModel';

const chartConfig: ChartConfig = {
    payouts: { color: 'hsl(142 76% 45%)', label: 'Payouts' },
    spend: { color: 'hsl(0 84% 60%)', label: 'Spend' },
};

export function MonthlyPayoutChart({
    points,
    targetDollars,
}: {
    readonly points: readonly StatementChartPoint[];
    readonly targetDollars: null | number;
}) {
    if (points.length === 0) {
        return (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                No month recorded yet.
            </div>
        );
    }
    return (
        <ChartContainer
            className={cn(
                'app-prop-accounts__monthly-payout-chart',
                'aspect-16/7 min-h-100 w-full',
            )}
            config={chartConfig}
        >
            <BarChart
                data={[...points]}
                margin={{ bottom: 20, left: 0, right: 12, top: 10 }}
            >
                <CartesianGrid stroke="#ccc" strokeDasharray="3 3" />
                <XAxis
                    axisLine={false}
                    dataKey="month"
                    fontSize={11}
                    tickLine={false}
                    tickMargin={6}
                />
                <YAxis
                    axisLine={false}
                    tickFormatter={(value: number) =>
                        formatCompactCurrency(value)
                    }
                    tickLine={false}
                    width={56}
                />
                {targetDollars !== null && (
                    <ReferenceLine
                        label="Target"
                        stroke="hsl(45 93% 58%)"
                        strokeDasharray="3 3"
                        y={targetDollars}
                    />
                )}
                <Bar
                    dataKey="spend"
                    fill="hsl(0 84% 60%)"
                    isAnimationActive={false}
                />
                <Bar
                    dataKey="payouts"
                    fill="hsl(142 76% 45%)"
                    isAnimationActive={false}
                />
            </BarChart>
        </ChartContainer>
    );
}
