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
import { cn } from '~/lib/utilities';

export interface RuleStressBarDatum {
    label: string;
    monthlyNet: number;
}

interface BarShapeProperties {
    height?: number;
    index?: number;
    width?: number;
    x?: number;
    y?: number;
}

interface Properties {
    rows: RuleStressBarDatum[];
}

const chartConfig: ChartConfig = {
    monthlyNet: { color: 'hsl(142 76% 45%)', label: 'Expected monthly net' },
};

export default function RuleStressBarChartView({ rows }: Properties) {
    if (rows.length === 0) {
        return (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                No simulation data yet.
            </div>
        );
    }

    return (
        <ChartContainer
            className={cn(
                'app-prop-calculator__rule-stress-bar-chart',
                'aspect-16/7 min-h-125 w-full',
            )}
            config={chartConfig}
        >
            <BarChart
                data={rows}
                margin={{ bottom: 28, left: 0, right: 12, top: 10 }}
            >
                <CartesianGrid stroke="#ccc" strokeDasharray="3 3" />
                <XAxis
                    axisLine={false}
                    dataKey="label"
                    fontSize={11}
                    tickLine={false}
                    tickMargin={6}
                />
                <YAxis
                    axisLine={false}
                    // Force zero into view even when every scenario happens
                    // to land on the same side of it — otherwise the y=0
                    // reference line below can end up clipped out of frame.
                    domain={[
                        (min: number) => Math.min(0, min),
                        (max: number) => Math.max(0, max),
                    ]}
                    label={{
                        angle: -90,
                        fontSize: 11,
                        position: 'insideLeft',
                        value: 'Monthly net',
                    }}
                    tickFormatter={(v: number) => formatCompactCurrency(v)}
                    tickLine={false}
                    width={56}
                />
                <ReferenceLine
                    stroke="hsl(0 0% 50%)"
                    strokeDasharray="3 3"
                    y={0}
                />
                <Bar
                    dataKey="monthlyNet"
                    isAnimationActive={false}
                    shape={(properties: unknown) => {
                        const {
                            height = 0,
                            index = 0,
                            width = 0,
                            x = 0,
                            y = 0,
                        } = properties as BarShapeProperties;
                        // Baseline (always the first bar) vs every stressed
                        // variant — reusing the same green/red status colors
                        // used throughout this app (pass/good vs bust/bad),
                        // not a new palette.
                        const fill =
                            index === 0 ? 'hsl(142 76% 45%)' : 'hsl(0 84% 60%)';
                        // `monthlyNet` can be negative (a losing setup), in
                        // which case Recharts hands this shape a *negative*
                        // height with `y` at the bar's top edge — clamping
                        // to `Math.max(0, height)` (fine for the
                        // always-non-negative bars elsewhere in this app)
                        // would silently zero those bars out here.
                        const rectHeight = Math.abs(height);
                        const rectY = height < 0 ? y + height : y;
                        return (
                            <rect
                                fill={fill}
                                fillOpacity={0.8}
                                height={rectHeight}
                                width={Math.max(0, width)}
                                x={x}
                                y={rectY}
                            />
                        );
                    }}
                />
            </BarChart>
        </ChartContainer>
    );
}
