import { useId } from 'react';
import { Area, AreaChart, XAxis, YAxis } from 'recharts';
import { type BaseAxisProps } from 'recharts/types/util/types';
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '~/components/ui/Chart';

type AreaChartNewProps = {
    data: unknown[] | undefined;
    config: ChartConfig;
    xAxis: {
        dataKey: string;
    };
    yAxis: {
        tickFormatter: BaseAxisProps['tickFormatter'];
    };
    area: {
        dataKey: string;
    };
    tooltip: {
        labelKey: string;
        nameKey: string;
    };
};

export default function AreaChartNew(props: AreaChartNewProps) {
    const id = useId();

    return (
        <ChartContainer className="h-full w-full" config={props.config}>
            <AreaChart data={props.data}>
                <defs>
                    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#525151" stopOpacity={0.5} />
                        <stop offset="95%" stopColor="#525151" stopOpacity={0} />
                    </linearGradient>
                </defs>

                <XAxis dataKey={props.xAxis.dataKey} tickLine={false} tickMargin={10} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={props.yAxis.tickFormatter} />
                <Area
                    dataKey={props.area.dataKey}
                    type="monotone"
                    stroke="#a3a3a3"
                    fillOpacity={1}
                    fill={`url(#${id})`}
                />

                <ChartTooltip
                    content={
                        <ChartTooltipContent
                            labelKey={props.tooltip.labelKey}
                            nameKey={props.tooltip.nameKey}
                            indicator="line"
                        />
                    }
                />
            </AreaChart>
        </ChartContainer>
    );
}
