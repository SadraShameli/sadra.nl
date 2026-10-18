'use client';

import { Bar, BarChart, ReferenceLine, XAxis, YAxis } from 'recharts';

import {
    CHART_BAR_PROPS,
    CHART_REFERENCE_LABEL_PROPS,
    CHART_REFERENCE_LINE_PROPS,
    CHART_X_AXIS_PROPS,
    CHART_Y_AXIS_PROPS,
    type ChartConfig,
    ChartContainer,
    ChartSize,
} from '~/components/ui/chart';

interface Properties {
    caption?: string;
    distribution: number[];
    halfThreshold?: boolean;
}

const chartConfig: ChartConfig = {
    p: { color: 'var(--chart-1)', label: 'Probability' },
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
                            ...CHART_REFERENCE_LABEL_PROPS,
                            fontSize: 9,
                            value: `≥${halfK}`,
                        }}
                        x={halfK}
                    />
                )}
                <Bar
                    {...CHART_BAR_PROPS}
                    dataKey="p"
                    fill="var(--color-p)"
                    fillOpacity={0.85}
                />
            </BarChart>
        </ChartContainer>
    );
}
