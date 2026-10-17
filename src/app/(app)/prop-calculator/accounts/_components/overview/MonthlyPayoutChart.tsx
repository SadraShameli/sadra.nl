'use client';

import { Bar, BarChart, ReferenceLine, XAxis, YAxis } from 'recharts';

import {
    CHART_REFERENCE_LINE_PROPS,
    CHART_X_AXIS_PROPS,
    CHART_Y_AXIS_PROPS,
    type ChartConfig,
    ChartContainer,
    ChartSize,
} from '~/components/ui/Chart';
import { formatCompactCurrency } from '~/lib/format';

import { type StatementChartPoint } from './overviewModel';

const chartConfig: ChartConfig = {
    payouts: { color: 'var(--success)', label: 'Payouts' },
    spend: { color: 'var(--destructive)', label: 'Spend' },
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
            className="app-prop-accounts__monthly-payout-chart"
            config={chartConfig}
            size={ChartSize.Tall}
        >
            <BarChart
                data={[...points]}
                margin={{ bottom: 20, left: 0, right: 12, top: 10 }}
            >
                <XAxis {...CHART_X_AXIS_PROPS} dataKey="month" />
                <YAxis
                    {...CHART_Y_AXIS_PROPS}
                    tickFormatter={(value: number) =>
                        formatCompactCurrency(value)
                    }
                />
                {targetDollars !== null && (
                    <ReferenceLine
                        {...CHART_REFERENCE_LINE_PROPS}
                        label="Target"
                        stroke="var(--warning)"
                        y={targetDollars}
                    />
                )}
                <Bar
                    dataKey="spend"
                    fill="var(--destructive)"
                    isAnimationActive={false}
                />
                <Bar
                    dataKey="payouts"
                    fill="var(--success)"
                    isAnimationActive={false}
                />
            </BarChart>
        </ChartContainer>
    );
}
