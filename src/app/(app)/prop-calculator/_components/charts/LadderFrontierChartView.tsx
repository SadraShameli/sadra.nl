'use client';

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';

import { type ChartConfig, ChartContainer } from '~/components/ui/Chart';
import { formatCurrency } from '~/lib/format';
import { type LadderScore } from '~/lib/prop-calculator';
import { cn } from '~/lib/utilities';

interface Properties {
    frontier: readonly LadderScore[];
}

const chartConfig: ChartConfig = {
    frontier: { color: 'hsl(142 76% 45%)', label: 'Efficient frontier' },
};

export default function LadderFrontierChartView({ frontier }: Properties) {
    const data = frontier.map((score) => ({
        cost: +score.costPerFunded.toFixed(0),
        days: +score.expectedDaysToFunded.toFixed(1),
        label: score.ladder.join(' / '),
    }));

    return data.length === 0 ? null : (
        <ChartContainer
            className={cn(
                'app-prop-calculator__ladder-frontier',
                'aspect-auto h-[260px] w-full',
            )}
            config={chartConfig}
        >
            <LineChart accessibilityLayer data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                    dataKey="days"
                    label={{
                        offset: -4,
                        position: 'insideBottom',
                        value: 'Expected days to funded',
                    }}
                    tickLine={false}
                    type="number"
                />
                <YAxis
                    tickFormatter={(value: number) => formatCurrency(value)}
                    tickLine={false}
                    width={72}
                />
                <Line
                    dataKey="cost"
                    dot={{ r: 3 }}
                    stroke="var(--color-frontier)"
                    strokeWidth={2}
                    type="stepAfter"
                />
            </LineChart>
        </ChartContainer>
    );
}
