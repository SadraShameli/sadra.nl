import { useId } from 'react';
import { Area, AreaChart, XAxis, YAxis } from 'recharts';

import {
    CHART_STROKE_WIDTH,
    CHART_X_AXIS_PROPS,
    CHART_Y_AXIS_PROPS,
    type ChartConfig,
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '~/components/ui/chart';
import { ChartAreaGradient } from '~/components/ui/chart/chart-area-gradient';

type AreaChartNewProperties = {
    area: {
        dataKey: string;
    };
    className?: string;
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
        <ChartContainer
            className={properties.className}
            config={properties.config}
        >
            <AreaChart data={properties.data}>
                <defs>
                    <ChartAreaGradient id={id} />
                </defs>

                <XAxis
                    {...CHART_X_AXIS_PROPS}
                    dataKey={properties.xAxis.dataKey}
                />

                <YAxis
                    {...CHART_Y_AXIS_PROPS}
                    domain={['auto', 'auto']}
                    tickFormatter={properties.yAxis.tickFormatter}
                />

                <Area
                    dataKey={properties.area.dataKey}
                    fill={`url(#${id})`}
                    fillOpacity={1}
                    stroke="var(--chart-1)"
                    strokeWidth={CHART_STROKE_WIDTH}
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
                />
            </AreaChart>
        </ChartContainer>
    );
}
