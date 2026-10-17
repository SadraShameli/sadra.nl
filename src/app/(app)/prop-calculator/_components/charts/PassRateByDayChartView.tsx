'use client';

import { Area, AreaChart, XAxis, YAxis } from 'recharts';

import {
    CHART_STROKE_WIDTH,
    CHART_X_AXIS_PROPS,
    CHART_Y_AXIS_PROPS,
    type ChartConfig,
    ChartContainer,
    ChartSize,
} from '~/components/ui/chart';
import { type SimOutputs } from '~/lib/prop-calculator';

interface Properties {
    maxEvalDays: number;
    result: SimOutputs;
    totalTrials: number;
}

const chartConfig: ChartConfig = {
    passRate: { color: 'var(--success)', label: 'Cumulative pass %' },
};

interface ChartRow {
    day: number;
    passRate: number;
}

export default function PassRateByDayChartView({
    maxEvalDays,
    result,
    totalTrials,
}: Properties) {
    if (result.daysToPassValues.length === 0) {
        return (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                No passing trials yet.
            </div>
        );
    }

    const data = buildPassRateCurve(
        result.daysToPassValues,
        totalTrials,
        maxEvalDays,
    );

    return (
        <ChartContainer
            className="app-prop-calculator__pass-rate-chart"
            config={chartConfig}
            size={ChartSize.Tall}
        >
            <AreaChart
                data={data}
                margin={{ bottom: 28, left: 0, right: 12, top: 10 }}
            >
                <XAxis
                    {...CHART_X_AXIS_PROPS}
                    dataKey="day"
                    label={{
                        fontSize: 11,
                        offset: 12,
                        position: 'bottom',
                        value: 'Trading day',
                    }}
                />
                <YAxis
                    {...CHART_Y_AXIS_PROPS}
                    domain={[0, 1]}
                    tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                />
                <Area
                    dataKey="passRate"
                    fill="var(--color-passRate)"
                    fillOpacity={0.18}
                    isAnimationActive={false}
                    stroke="var(--color-passRate)"
                    strokeWidth={CHART_STROKE_WIDTH}
                    type="monotone"
                />
            </AreaChart>
        </ChartContainer>
    );
}

function buildPassRateCurve(
    daysToPassValues: readonly number[],
    totalTrials: number,
    maxDay: number,
): ChartRow[] {
    if (totalTrials === 0) return [];
    const counts = Array.from({ length: maxDay + 1 }, () => 0);
    for (const d of daysToPassValues) {
        const day = Math.max(0, Math.min(maxDay, Math.floor(d)));
        counts[day] = (counts[day] ?? 0) + 1;
    }
    const rows: ChartRow[] = [];
    let cum = 0;
    for (let day = 0; day <= maxDay; day++) {
        cum += counts[day] ?? 0;
        rows.push({ day, passRate: cum / totalTrials });
    }
    return rows;
}
