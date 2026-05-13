import { useId } from 'react';
import { Area, AreaChart, XAxis, YAxis } from 'recharts';

import {
    type ChartConfig,
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '~/components/ui/Chart';

type AreaChartNewProps = {
    area: {
        dataKey: string;
    };
    config: ChartConfig;
    data: undefined | unknown[];
    tooltip: {
        labelKey: string;
        nameKey: string;
    };
    xAxis: {
        dataKey: string;
    };
    yAxis: {
        tickFormatter: (value: number, index: number) => string;
    };
};

export default function AreaChartNew(props: AreaChartNewProps) {
    const id = useId();

    return (
        <ChartContainer className="h-full w-full" config={props.config}>
            <AreaChart data={props.data}>
                <defs>
                    <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
                        <stop
                            offset="5%"
                            stopColor="#525151"
                            stopOpacity={0.5}
                        />

                        <stop
                            offset="95%"
                            stopColor="#525151"
                            stopOpacity={0}
                        />
                    </linearGradient>
                </defs>

                <XAxis
                    axisLine={false}
                    dataKey={props.xAxis.dataKey}
                    tickLine={false}
                    tickMargin={10}
                />

                <YAxis
                    axisLine={false}
                    tickFormatter={props.yAxis.tickFormatter}
                    tickLine={false}
                />

                <Area
                    dataKey={props.area.dataKey}
                    fill={`url(#${id})`}
                    fillOpacity={1}
                    stroke="#a3a3a3"
                    type="monotone"
                />

                <ChartTooltip
                    content={
                        <ChartTooltipContent
                            indicator="line"
                            labelKey={props.tooltip.labelKey}
                            nameKey={props.tooltip.nameKey}
                        />
                    }
                />
            </AreaChart>
        </ChartContainer>
    );
}
