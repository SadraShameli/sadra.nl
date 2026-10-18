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
import { type BarShapeProperties } from './types';

export interface RuleStressBarDatum {
    label: string;
    monthlyNet: number;
}

interface Properties {
    rows: RuleStressBarDatum[];
}

const chartConfig: ChartConfig = {
    monthlyNet: { color: 'var(--success)', label: 'Expected monthly net' },
};

const BASELINE_FILL = 'var(--info)';
const WORSE_FILL = 'var(--destructive)';
const NOT_WORSE_FILL = 'var(--success)';

export default function RuleStressBarChartView({ rows }: Properties) {
    return rows.length === 0 ? (
        <ChartEmptyState title="No simulation data yet" />
    ) : (
        <div className="flex flex-col gap-2">
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
                    <ReferenceLine
                        {...CHART_REFERENCE_LINE_PROPS}
                        stroke="var(--muted-foreground)"
                        y={0}
                    />
                    <Bar
                        {...CHART_BAR_PROPS}
                        dataKey="monthlyNet"
                        shape={(properties: unknown) => {
                            const {
                                height = 0,
                                index = 0,
                                width = 0,
                                x = 0,
                                y = 0,
                            } = properties as BarShapeProperties;
                            const fill = barFill(rows, index);
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
            <p className="text-xs text-muted-foreground">
                <span aria-hidden className="text-info">
                    ■
                </span>{' '}
                Baseline ·{' '}
                <span aria-hidden className="text-destructive">
                    ■
                </span>{' '}
                Worse than baseline ·{' '}
                <span aria-hidden className="text-success">
                    ■
                </span>{' '}
                Same or better
            </p>
        </div>
    );
}

function barFill(rows: readonly RuleStressBarDatum[], index: number): string {
    const baseline = rows[0];
    const row = rows[index];
    if (index === 0 || baseline === undefined || row === undefined) {
        return BASELINE_FILL;
    }
    return row.monthlyNet < baseline.monthlyNet ? WORSE_FILL : NOT_WORSE_FILL;
}
