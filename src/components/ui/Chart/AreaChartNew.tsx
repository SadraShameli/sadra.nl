import { useId } from 'react';
import { Area, AreaChart, XAxis, YAxis } from 'recharts';

import {
    type ChartConfig,
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '~/components/ui/Chart';

type AreaChartNewProperties = {
    area: {
        dataKey: string;
    };
    config: ChartConfig;
    data: undefined | unknown[];
    tooltip: {
        labelKey: string;
        nameKey: string;
        valueFormatter?: (value: number) => string;
    };
    xAxis: {
        dataKey: string;
    };
    yAxis: {
        tickFormatter: (value: number, index: number) => string;
    };
};

export default function AreaChartNew(properties: AreaChartNewProperties) {
    const id = useId();

    return (
        <ChartContainer className="size-full" config={properties.config}>
            <AreaChart data={properties.data}>
                <defs>
                    <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
                        <stop
                            offset="5%"
                            stopColor="var(--chart-1)"
                            stopOpacity={0.28}
                        />

                        <stop
                            offset="95%"
                            stopColor="var(--chart-1)"
                            stopOpacity={0}
                        />
                    </linearGradient>
                </defs>

                <XAxis
                    axisLine={false}
                    dataKey={properties.xAxis.dataKey}
                    tickLine={false}
                    tickMargin={10}
                />

                <YAxis
                    axisLine={false}
                    tickFormatter={properties.yAxis.tickFormatter}
                    tickLine={false}
                    width="auto"
                />

                <Area
                    dataKey={properties.area.dataKey}
                    fill={`url(#${id})`}
                    fillOpacity={1}
                    stroke="var(--chart-1)"
                    strokeWidth={1.6}
                    type="monotone"
                />

                <ChartTooltip
                    content={
                        <ChartTooltipContent
                            indicator="line"
                            labelKey={properties.tooltip.labelKey}
                            nameKey={properties.tooltip.nameKey}
                            valueFormatter={properties.tooltip.valueFormatter}
                        />
                    }
                    cursor={{ stroke: 'var(--line-strong)', strokeWidth: 1 }}
                />
            </AreaChart>
        </ChartContainer>
    );
}
