'use client';

import {
    Area,
    ComposedChart,
    Line,
    ReferenceLine,
    XAxis,
    YAxis,
} from 'recharts';

import {
    CHART_REFERENCE_LINE_PROPS,
    CHART_STROKE_WIDTH,
    CHART_X_AXIS_PROPS,
    CHART_Y_AXIS_PROPS,
    type ChartConfig,
    ChartContainer,
    ChartSize,
} from '~/components/ui/Chart';
import { formatCompactCurrency } from '~/lib/format';
import { TRADING_DAYS_PER_MONTH } from '~/lib/prop-calculator';
import { type PortfolioTimelineResult } from '~/lib/prop-calculator/portfolioTimeline';

interface ChartRow {
    low: number;
    month: number;
    net50: number;
    range: number;
}

interface Properties {
    result: PortfolioTimelineResult;
}

const chartConfig: ChartConfig = {
    band: {
        color: 'color-mix(in oklab, var(--success) 18%, transparent)',
        label: 'P10–P90',
    },
    median: { color: 'var(--success)', label: 'Median net' },
};

export default function CashFlowBandChartView({ result }: Properties) {
    if (result.days.length === 0) {
        return (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                No simulation data yet.
            </div>
        );
    }

    const data = buildChartData(result);

    return (
        <ChartContainer
            className="app-prop-calculator__cash-flow-band-chart"
            config={chartConfig}
            size={ChartSize.Tall}
        >
            <ComposedChart
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
                <ReferenceLine
                    {...CHART_REFERENCE_LINE_PROPS}
                    label={{
                        fill: 'var(--muted-foreground)',
                        fontSize: 11,
                        position: 'insideBottomLeft',
                        value: 'Break-even',
                    }}
                    stroke="var(--muted-foreground)"
                    y={0}
                />
                <Area
                    dataKey="low"
                    fill="transparent"
                    isAnimationActive={false}
                    legendType="none"
                    stackId="band"
                    stroke="none"
                />
                <Area
                    dataKey="range"
                    fill="var(--success)"
                    fillOpacity={0.18}
                    isAnimationActive={false}
                    legendType="none"
                    stackId="band"
                    stroke="none"
                />
                <Line
                    dataKey="net50"
                    dot={false}
                    isAnimationActive={false}
                    stroke="var(--success)"
                    strokeWidth={CHART_STROKE_WIDTH}
                    type="monotone"
                />
            </ComposedChart>
        </ChartContainer>
    );
}

function buildChartData(result: PortfolioTimelineResult): ChartRow[] {
    return result.days.map((day, index) => {
        const low = result.netP10[index] ?? 0;
        const high = result.netP90[index] ?? 0;
        return {
            low,
            month: +(day / TRADING_DAYS_PER_MONTH).toFixed(1),
            net50: result.netP50[index] ?? 0,
            range: Math.max(0, high - low),
        };
    });
}
