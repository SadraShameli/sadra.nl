'use client';

import {
    Bar,
    BarChart,
    type BarShapeProps,
    CartesianGrid,
    ReferenceLine,
    XAxis,
    YAxis,
} from 'recharts';

import { type ChartConfig, ChartContainer } from '~/components/ui/Chart';
import { cn } from '~/lib/utils';

interface Props {
    distribution: number[];
    halfThreshold?: boolean;
}

const chartConfig: ChartConfig = {
    p: { color: 'hsl(217 91% 60%)', label: 'Probability' },
};

export default function AccountsPassedDistributionChart({
    distribution,
    halfThreshold = true,
}: Props) {
    const N = Math.max(0, distribution.length - 1);
    const halfK = Math.ceil(N / 2);
    const data = distribution.map((p, k) => ({ k, p }));
    const maxP = data.reduce((m, d) => Math.max(d.p, m), 0);
    return (
        <div
            className={cn(
                'app-prop-calculator__accounts-passed-chart',
                'h-44 w-full',
            )}
        >
            <ChartContainer className="h-full w-full" config={chartConfig}>
                <BarChart
                    data={data}
                    margin={{ bottom: 18, left: 0, right: 6, top: 6 }}
                >
                    <CartesianGrid stroke="#ccc" strokeDasharray="3 3" />
                    <XAxis
                        axisLine={false}
                        dataKey="k"
                        fontSize={10}
                        label={{
                            fontSize: 10,
                            offset: 6,
                            position: 'bottom',
                            value: '# accounts passed',
                        }}
                        tickLine={false}
                        tickMargin={4}
                    />
                    <YAxis
                        axisLine={false}
                        domain={[0, maxP > 0 ? maxP * 1.1 : 1]}
                        fontSize={10}
                        tickFormatter={(v: number) =>
                            `${(v * 100).toFixed(0)}%`
                        }
                        tickLine={false}
                        width={32}
                    />
                    {halfThreshold && halfK > 0 && halfK <= N && (
                        <ReferenceLine
                            label={{
                                fill: 'hsl(45 100% 60%)',
                                fontSize: 9,
                                value: `≥${halfK}`,
                            }}
                            stroke="hsl(45 100% 60%)"
                            strokeDasharray="3 3"
                            x={halfK}
                        />
                    )}
                    <Bar
                        dataKey="p"
                        isAnimationActive={false}
                        shape={(props: BarShapeProps) => {
                            const { height, index, width, x, y } = props;
                            const fill =
                                index === 0
                                    ? 'hsl(0 80% 60%)'
                                    : index === N
                                      ? 'hsl(142 76% 45%)'
                                      : 'hsl(217 91% 60%)';
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
        </div>
    );
}
