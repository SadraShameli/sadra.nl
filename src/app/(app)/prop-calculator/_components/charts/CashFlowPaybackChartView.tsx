'use client';

import { Line, LineChart, XAxis, YAxis } from 'recharts';

import {
    CHART_STROKE_WIDTH,
    CHART_X_AXIS_PROPS,
    CHART_Y_AXIS_PROPS,
    type ChartConfig,
    ChartContainer,
} from '~/components/ui/chart';
import { formatCompactCurrency } from '~/lib/format';
import { TRADING_DAYS_PER_MONTH } from '~/lib/prop-calculator';
import { type PortfolioTimelineResult } from '~/lib/prop-calculator/portfolioTimeline';

interface ChartRow {
    month: number;
    payout: number;
    spend: number;
}

interface Properties {
    result: PortfolioTimelineResult;
}

const chartConfig: ChartConfig = {
    payout: { color: 'var(--success)', label: 'Cumulative payout' },
    spend: { color: 'var(--destructive)', label: 'Cumulative spend' },
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
            className="app-prop-calculator__cash-flow-payback-chart"
            config={chartConfig}
        >
            <LineChart
                data={data}
                margin={{ bottom: 28, left: 0, right: 12, top: 10 }}
            >
                <XAxis
                    {...CHART_X_AXIS_PROPS}
                    dataKey="month"
                    label={{
                        fontSize: 11,
                        offset: 12,
                        position: 'bottom',
                        value: 'Months',
                    }}
                    tickFormatter={(v: number) => `${v}mo`}
                />
                <YAxis
                    {...CHART_Y_AXIS_PROPS}
                    tickFormatter={(v: number) => formatCompactCurrency(v)}
                />
                <Line
                    dataKey="spend"
                    dot={false}
                    isAnimationActive={false}
                    stroke="var(--destructive)"
                    strokeWidth={CHART_STROKE_WIDTH}
                    type="monotone"
                />
                <Line
                    dataKey="payout"
                    dot={false}
                    isAnimationActive={false}
                    stroke="var(--success)"
                    strokeWidth={CHART_STROKE_WIDTH}
                    type="monotone"
                />
            </LineChart>
        </ChartContainer>
    );
}
