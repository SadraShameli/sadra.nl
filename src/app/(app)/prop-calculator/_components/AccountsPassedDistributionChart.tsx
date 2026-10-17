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

import { type BarShapeProperties } from './charts/types';

interface Properties {
    caption?: string;
    distribution: number[];
    halfThreshold?: boolean;
}

const chartConfig: ChartConfig = {
    p: { color: 'var(--info)', label: 'Probability' },
};

const DEFAULT_CAPTION = '# accounts passed';

export default function AccountsPassedDistributionChart({
    caption = DEFAULT_CAPTION,
    distribution,
    halfThreshold = true,
}: Properties) {
    const N = Math.max(0, distribution.length - 1);
    const halfK = Math.ceil(N / 2);
    const data = distribution.map((p, k) => ({ k, p }));
    const maxP = data.reduce((m, d) => Math.max(d.p, m), 0);
    return (
        <ChartContainer
            className="app-prop-calculator__accounts-passed-chart"
            config={chartConfig}
            size={ChartSize.Compact}
        >
            <BarChart
                data={data}
                margin={{ bottom: 18, left: 0, right: 6, top: 6 }}
            >
                <XAxis
                    {...CHART_X_AXIS_PROPS}
                    dataKey="k"
                    label={{
                        fontSize: 10,
                        offset: 6,
                        position: 'bottom',
                        value: caption,
                    }}
                />
                <YAxis
                    {...CHART_Y_AXIS_PROPS}
                    domain={[0, maxP > 0 ? maxP * 1.1 : 1]}
                    tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                />
                {halfThreshold && halfK > 0 && halfK <= N && (
                    <ReferenceLine
                        {...CHART_REFERENCE_LINE_PROPS}
                        label={{
                            fill: 'var(--warning)',
                            fontSize: 9,
                            value: `≥${halfK}`,
                        }}
                        stroke="var(--warning)"
                        x={halfK}
                    />
                )}
                <Bar
                    dataKey="p"
                    isAnimationActive={false}
                    shape={(properties: unknown) => {
                        const {
                            height = 0,
                            index = 0,
                            width = 0,
                            x = 0,
                            y = 0,
                        } = properties as BarShapeProperties;
                        const fill =
                            index === 0
                                ? 'var(--destructive)'
                                : index === N
                                  ? 'var(--success)'
                                  : 'var(--info)';
                        return (
                            <rect
                                fill={fill}
                                fillOpacity={0.85}
                                height={Math.max(0, height)}
                                width={Math.max(0, width)}
                                x={x}
                                y={y}
                            />
                        );
                    }}
                />
            </BarChart>
        </ChartContainer>
    );
}
