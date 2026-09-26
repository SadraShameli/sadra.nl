'use client';

import {
    CartesianGrid,
    Line,
    LineChart,
    ReferenceLine,
    XAxis,
    YAxis,
} from 'recharts';

import { type ChartConfig, ChartContainer } from '~/components/ui/Chart';
import { formatCompactCurrency } from '~/lib/format';
import { cn } from '~/lib/utilities';

import { type SnapshotSeries } from './snapshotSeries';

const chartConfig: ChartConfig = {
    balance: { color: 'hsl(160 84% 45%)', label: 'Balance' },
    event: { color: 'hsl(38 92% 55%)', label: 'Event' },
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
                <p className="text-sm text-muted-foreground">
                    No balances recorded yet.
                </p>
            ) : (
                <ChartContainer
                    aria-label="Balance history"
                    className={cn(
                        'app-prop-accounts__snapshot-chart',
                        'aspect-16/6 min-h-56 w-full',
                    )}
                    config={chartConfig}
                    role="img"
                >
                    <LineChart
                        data={series.points}
                        margin={{ bottom: 8, left: 0, right: 12, top: 10 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                            axisLine={false}
                            dataKey="asOf"
                            tickLine={false}
                            tickMargin={6}
                        />
                        <YAxis
                            axisLine={false}
                            domain={['auto', 'auto']}
                            tickFormatter={(value: number) =>
                                formatCompactCurrency(value)
                            }
                            tickLine={false}
                            width={64}
                        />
                        {series.markers
                            .filter((marker) => snapshotDates.has(marker.on))
                            .map((marker) => (
                                <ReferenceLine
                                    key={marker.id}
                                    stroke="var(--color-event)"
                                    strokeDasharray="4 4"
                                    x={marker.on}
                                />
                            ))}
                        <Line
                            dataKey="balance"
                            dot
                            isAnimationActive={false}
                            stroke="var(--color-balance)"
                            strokeWidth={2}
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
                            <span className="tabular-nums">{marker.on}</span>{' '}
                            {marker.label}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
