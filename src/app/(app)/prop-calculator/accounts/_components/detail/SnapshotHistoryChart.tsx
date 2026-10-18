'use client';

import { ChartLine } from 'lucide-react';
import { Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts';

import {
    CHART_REFERENCE_LINE_PROPS,
    CHART_STROKE_WIDTH,
    CHART_X_AXIS_PROPS,
    CHART_Y_AXIS_PROPS,
    type ChartConfig,
    ChartContainer,
    ChartSize,
} from '~/components/ui/chart';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';
import { formatCompactCurrency, formatDisplayDate } from '~/lib/format';

import { type SnapshotSeries } from './snapshotSeries';

const chartConfig: ChartConfig = {
    balance: { color: 'var(--chart-1)', label: 'Balance' },
    event: { color: 'var(--chart-2)', label: 'Event' },
};

export function SnapshotHistoryChart({
    series,
}: {
    readonly series: SnapshotSeries;
}) {
    const snapshotDates = new Set(series.points.map((point) => point.asOf));
    return (
        <div className="flex flex-col gap-3">
            {series.points.length === 0 ? (
                <EmptyState
                    icon={ChartLine}
                    size={EmptyStateSize.Compact}
                    title="No balances recorded yet"
                />
            ) : (
                <ChartContainer
                    aria-label="Balance history"
                    className="app-prop-accounts__snapshot-chart"
                    config={chartConfig}
                    role="img"
                    size={ChartSize.Compact}
                >
                    <LineChart
                        data={series.points}
                        margin={{ bottom: 8, left: 0, right: 12, top: 10 }}
                    >
                        <XAxis
                            {...CHART_X_AXIS_PROPS}
                            dataKey="asOf"
                            tickFormatter={(value: string) =>
                                formatDisplayDate(value)
                            }
                        />
                        <YAxis
                            {...CHART_Y_AXIS_PROPS}
                            domain={['auto', 'auto']}
                            tickFormatter={(value: number) =>
                                formatCompactCurrency(value)
                            }
                        />
                        {series.markers
                            .filter((marker) => snapshotDates.has(marker.on))
                            .map((marker) => (
                                <ReferenceLine
                                    {...CHART_REFERENCE_LINE_PROPS}
                                    key={marker.id}
                                    stroke="var(--color-event)"
                                    x={marker.on}
                                />
                            ))}
                        <Line
                            dataKey="balance"
                            dot
                            isAnimationActive={false}
                            stroke="var(--color-balance)"
                            strokeWidth={CHART_STROKE_WIDTH}
                            type="linear"
                        />
                    </LineChart>
                </ChartContainer>
            )}
            {series.markers.length > 0 && (
                <ul
                    aria-label="Lifecycle events"
                    className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
                >
                    {series.markers.map((marker) => (
                        <li key={marker.id}>
                            <span className="tabular-nums">
                                {formatDisplayDate(marker.on)}
                            </span>{' '}
                            {marker.label}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
