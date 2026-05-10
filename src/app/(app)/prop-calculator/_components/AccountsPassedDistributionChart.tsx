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

interface Props {
    distribution: number[];
    halfThreshold?: boolean;
}

const chartConfig: ChartConfig = {
    p: { label: 'Probability', color: 'hsl(217 91% 60%)' },
};

export default function AccountsPassedDistributionChart({
    distribution,
    halfThreshold = true,
}: Props) {
    const N = Math.max(0, distribution.length - 1);
    const halfK = Math.ceil(N / 2);
    const data = distribution.map((p, k) => ({ k, p }));
    const maxP = data.reduce((m, d) => (d.p > m ? d.p : m), 0);
    return (
        <div className="h-44 w-full">
            <ChartContainer config={chartConfig} className="h-full w-full">
                <BarChart
                    data={data}
                    margin={{ top: 6, right: 6, left: 0, bottom: 18 }}
                >
                    <CartesianGrid strokeDasharray="3 3" stroke="#ccc" />
                    <XAxis
                        dataKey="k"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={4}
                        label={{
                            value: '# accounts passed',
                            position: 'bottom',
                            offset: 6,
                            fontSize: 10,
                        }}
                        fontSize={10}
                    />
                    <YAxis
                        tickLine={false}
                        axisLine={false}
                        width={32}
                        domain={[0, maxP > 0 ? maxP * 1.1 : 1]}
                        tickFormatter={(v: number) =>
                            `${(v * 100).toFixed(0)}%`
                        }
                        fontSize={10}
                    />
                    {halfThreshold && halfK > 0 && halfK <= N && (
                        <ReferenceLine
                            x={halfK}
                            stroke="hsl(45 100% 60%)"
                            strokeDasharray="3 3"
                            label={{
                                value: `≥${halfK}`,
                                fontSize: 9,
                                fill: 'hsl(45 100% 60%)',
                            }}
                        />
                    )}
                    <Bar
                        dataKey="p"
                        isAnimationActive={false}
                        shape={(props: BarShapeProps) => {
                            const {
                                x = 0,
                                y = 0,
                                width = 0,
                                height = 0,
                                index,
                            } = props;
                            const fill =
                                index === 0
                                    ? 'hsl(0 80% 60%)'
                                    : index === N
                                      ? 'hsl(142 76% 45%)'
                                      : 'hsl(217 91% 60%)';
                            return (
                                <rect
                                    x={x}
                                    y={y}
                                    width={Math.max(0, width)}
                                    height={Math.max(0, height)}
                                    fill={fill}
                                    fillOpacity={0.85}
                                />
                            );
                        }}
                    />
                </BarChart>
            </ChartContainer>
        </div>
    );
}
