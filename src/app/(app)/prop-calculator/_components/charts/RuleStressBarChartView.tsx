'use client';

import { Bar, BarChart, ReferenceLine, XAxis, YAxis } from 'recharts';

import {
    CHART_BAR_PROPS,
    CHART_REFERENCE_LINE_PROPS,
    CHART_X_AXIS_PROPS,
    CHART_Y_AXIS_PROPS,
    type ChartConfig,
    ChartContainer,
} from '~/components/ui/chart';
import { formatCompactCurrency } from '~/lib/format';

import { ChartEmptyState } from './ChartEmptyState';

export interface RuleStressBarDatum {
    label: string;
    monthlyNet: number;
}

interface Properties {
    rows: RuleStressBarDatum[];
}

const chartConfig: ChartConfig = {
    monthlyNet: { color: 'var(--chart-1)', label: 'Expected monthly net' },
};

export default function RuleStressBarChartView({ rows }: Properties) {
    return rows.length === 0 ? (
        <ChartEmptyState title="No simulation data yet" />
    ) : (
        <ChartContainer
            className="app-prop-calculator__rule-stress-bar-chart"
            config={chartConfig}
        >
            <BarChart
                data={rows}
                margin={{ bottom: 28, left: 0, right: 12, top: 10 }}
            >
                <XAxis {...CHART_X_AXIS_PROPS} dataKey="label" />
                <YAxis
                    {...CHART_Y_AXIS_PROPS}
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
                />
                <ReferenceLine {...CHART_REFERENCE_LINE_PROPS} y={0} />
                <Bar
                    {...CHART_BAR_PROPS}
                    dataKey="monthlyNet"
                    fill="var(--color-monthlyNet)"
                    fillOpacity={0.8}
                />
            </BarChart>
        </ChartContainer>
    );
}
