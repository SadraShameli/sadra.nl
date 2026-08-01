'use client';

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';

import { type ChartConfig, ChartContainer } from '~/components/ui/Chart';
import { formatCompactCurrency } from '~/lib/format';
import { type PortfolioTimelineResult } from '~/lib/prop-calculator/portfolioTimeline';
import { cn } from '~/lib/utilities';

interface ChartRow {
    month: number;
    payout: number;
    spend: number;
}

interface Properties {
    result: PortfolioTimelineResult;
}

const TRADING_DAYS_PER_MONTH = 21;

const chartConfig: ChartConfig = {
    payout: { color: 'hsl(142 76% 45%)', label: 'Cumulative payout' },
    spend: { color: 'hsl(0 84% 60%)', label: 'Cumulative spend' },
};

export default function CashFlowPaybackChartView({ result }: Properties) {
    if (result.days.length === 0) {
        return (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                No simulation data yet.
            </div>
        );
    }

    const data: ChartRow[] = result.days.map((day, index) => ({
        month: +(day / TRADING_DAYS_PER_MONTH).toFixed(1),
        payout: result.payoutP50[index] ?? 0,
        spend: result.spendP50[index] ?? 0,
    }));

    return (
        <ChartContainer
            className={cn(
                'app-prop-calculator__cash-flow-payback-chart',
                'aspect-4/3 min-h-90 w-full',
            )}
            config={chartConfig}
        >
            <LineChart
                data={data}
                margin={{ bottom: 28, left: 0, right: 12, top: 10 }}
            >
                <CartesianGrid stroke="#ccc" strokeDasharray="3 3" />
                <XAxis
                    axisLine={false}
                    dataKey="month"
                    label={{
                        fontSize: 11,
                        offset: 12,
                        position: 'bottom',
                        value: 'Months',
                    }}
                    tickFormatter={(v: number) => `${v}mo`}
                    tickLine={false}
                    tickMargin={6}
                />
                <YAxis
                    axisLine={false}
                    tickFormatter={(v: number) => formatCompactCurrency(v)}
                    tickLine={false}
                    width={60}
                />
                <Line
                    dataKey="spend"
                    dot={false}
                    isAnimationActive={false}
                    stroke="hsl(0 84% 60%)"
                    strokeWidth={2}
                    type="monotone"
                />
                <Line
                    dataKey="payout"
                    dot={false}
                    isAnimationActive={false}
                    stroke="hsl(142 76% 45%)"
                    strokeWidth={2}
                    type="monotone"
                />
            </LineChart>
        </ChartContainer>
    );
}
