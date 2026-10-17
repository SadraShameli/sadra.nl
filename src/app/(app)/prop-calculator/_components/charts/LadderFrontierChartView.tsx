'use client';

import { Line, LineChart, XAxis, YAxis } from 'recharts';

import {
    CHART_STROKE_WIDTH,
    CHART_X_AXIS_PROPS,
    CHART_Y_AXIS_PROPS,
    type ChartConfig,
    ChartContainer,
    ChartSize,
} from '~/components/ui/chart';
import { formatCurrency } from '~/lib/format';
import { type LadderScore } from '~/lib/prop-calculator';

interface Properties {
    frontier: readonly LadderScore[];
}

const chartConfig: ChartConfig = {
    frontier: { color: 'var(--success)', label: 'Efficient frontier' },
};

export default function LadderFrontierChartView({ frontier }: Properties) {
    const data = frontier.map((score) => ({
        cost: +score.costPerFunded.toFixed(0),
        days: +score.expectedDaysToFunded.toFixed(1),
        label: score.ladder.join(' / '),
    }));

    return data.length === 0 ? null : (
        <ChartContainer
            className="app-prop-calculator__ladder-frontier"
            config={chartConfig}
            size={ChartSize.Compact}
        >
            <LineChart accessibilityLayer data={data}>
                <XAxis
                    {...CHART_X_AXIS_PROPS}
                    dataKey="days"
                    label={{
                        offset: -4,
                        position: 'insideBottom',
                        value: 'Expected days to funded',
                    }}
                    type="number"
                />
                <YAxis
                    {...CHART_Y_AXIS_PROPS}
                    tickFormatter={(value: number) => formatCurrency(value)}
                />
                <Line
                    dataKey="cost"
                    dot={{ r: 3 }}
                    stroke="var(--color-frontier)"
                    strokeWidth={CHART_STROKE_WIDTH}
                    type="stepAfter"
                />
            </LineChart>
        </ChartContainer>
    );
}
