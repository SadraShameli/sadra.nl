'use client';

import { ChartColumn } from 'lucide-react';
import { Bar, BarChart, ReferenceLine, XAxis, YAxis } from 'recharts';

import {
    CHART_BAR_PROPS,
    CHART_REFERENCE_LINE_PROPS,
    CHART_X_AXIS_PROPS,
    CHART_Y_AXIS_PROPS,
    type ChartConfig,
    ChartContainer,
    ChartSize,
} from '~/components/ui/chart';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';
import { formatCompactCurrency, formatDisplayMonth } from '~/lib/format';

import { type StatementChartPoint } from './overviewModel';

const chartConfig: ChartConfig = {
    payouts: { color: 'var(--chart-1)', label: 'Payouts' },
    spend: { color: 'var(--chart-3)', label: 'Spend' },
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
            <EmptyState
                icon={ChartColumn}
                size={EmptyStateSize.Compact}
                title="No month recorded yet"
            />
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
                <XAxis
                    {...CHART_X_AXIS_PROPS}
                    dataKey="month"
                    tickFormatter={(value: string) => formatDisplayMonth(value)}
                />
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
                        y={targetDollars}
                    />
                )}
                <Bar
                    {...CHART_BAR_PROPS}
                    dataKey="spend"
                    fill="var(--chart-3)"
                />
                <Bar
                    {...CHART_BAR_PROPS}
                    dataKey="payouts"
                    fill="var(--chart-1)"
                />
            </BarChart>
        </ChartContainer>
    );
}
