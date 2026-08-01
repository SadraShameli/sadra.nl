'use client';

import {
    Area,
    CartesianGrid,
    ComposedChart,
    Line,
    ReferenceLine,
    XAxis,
    YAxis,
} from 'recharts';

import { type ChartConfig, ChartContainer } from '~/components/ui/Chart';
import { formatCompactCurrency } from '~/lib/format';
import { type PortfolioTimelineResult } from '~/lib/prop-calculator/portfolioTimeline';
import { cn } from '~/lib/utilities';

interface ChartRow {
    low: number;
    month: number;
    net50: number;
    range: number;
}

interface Properties {
    result: PortfolioTimelineResult;
}

const TRADING_DAYS_PER_MONTH = 21;

const chartConfig: ChartConfig = {
    band: { color: 'hsl(142 76% 45% / 0.18)', label: 'P10–P90' },
    median: { color: 'hsl(142 76% 45%)', label: 'Median net' },
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
            className={cn(
                'app-prop-calculator__cash-flow-band-chart',
                'aspect-16/7 min-h-125 w-full',
            )}
            config={chartConfig}
        >
            <ComposedChart
                data={data}
                margin={{ bottom: 28, left: 0, right: 12, top: 10 }}
            >
                <CartesianGrid
                    opacity={0.2}
                    stroke="#ccc"
                    strokeDasharray="3 3"
                />
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
                <ReferenceLine
                    label={{
                        fill: 'hsl(0 0% 70%)',
                        fontSize: 11,
                        position: 'right',
                        value: 'Break-even',
                    }}
                    stroke="hsl(0 0% 70%)"
                    strokeDasharray="4 4"
                    y={0}
                />
                {/* "Floating band" stacking technique: an invisible area up to
                    the P10 line, then a visible area stacked on top of it
                    spanning P10→P90 (`range = P90 - P10`). Unlike a plain
                    two-area punch-through (which only reads correctly when
                    every value sits on the same side of a shared zero
                    baseline), this stays correct even where the band
                    straddles zero — which cash flow always does early on,
                    before any card has ever paid out. */}
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
                    fill="hsl(142 76% 45%)"
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
                    stroke="hsl(142 76% 45%)"
                    strokeWidth={2.5}
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
