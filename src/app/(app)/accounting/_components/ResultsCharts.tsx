'use client';

import { useMemo } from 'react';
import { Bar, BarChart, XAxis, YAxis } from 'recharts';

import type { ConversionResult } from '~/lib/accounting/core/types';

import { ToolPanel } from '~/app/(app)/_components/ToolPanel';
import {
    CHART_BAR_RADIUS,
    CHART_X_AXIS_PROPS,
    CHART_Y_AXIS_PROPS,
    type ChartConfig,
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '~/components/ui/chart';
import { Eur } from '~/lib/accounting/core/money';

const TOP_COUNTERPART_COUNT = 10;
const FULL_WIDTH_PERCENT = 100;

const perDayConfig = {
    in: { color: 'var(--success)', label: 'IN' },
    out: { color: 'var(--destructive)', label: 'OUT' },
} satisfies ChartConfig;

export function ResultsCharts({ result }: { result: ConversionResult }) {
    const byDay = useMemo(() => {
        const map = new Map<
            string,
            { date: string; in: number; out: number }
        >();
        for (const b of result.bookings) {
            const row = map.get(b.date) ?? {
                date: b.date,
                in: 0,
                out: 0,
            };
            if (b.direction === 'IN') row.in += b.amountEur;
            else row.out += b.amountEur;
            map.set(b.date, row);
        }
        return map
            .values()
            .toArray()
            .toSorted((a, b) => a.date.localeCompare(b.date));
    }, [result]);

    const topCounterparts = useMemo(() => {
        const map = new Map<string, number>();
        for (const b of result.bookings) {
            map.set(
                b.counterpartName,
                (map.get(b.counterpartName) ?? 0) + b.amountEur,
            );
        }
        return [...map]
            .map(([name, value]) => ({ name, value }))
            .toSorted((a, b) => b.value - a.value)
            .slice(0, TOP_COUNTERPART_COUNT);
    }, [result]);
    const largestCounterpartValue = topCounterparts[0]?.value ?? 0;

    return result.bookings.length === 0 ? null : (
        <div className="grid gap-6 lg:grid-cols-2">
            <ToolPanel
                description="IN and OUT stacked per booking date."
                title="Per day"
            >
                <ChartContainer config={perDayConfig}>
                    <BarChart data={byDay}>
                        <XAxis {...CHART_X_AXIS_PROPS} dataKey="date" />
                        <YAxis
                            {...CHART_Y_AXIS_PROPS}
                            tickFormatter={(v: number) => Eur.formatWhole(v)}
                        />
                        <ChartTooltip
                            content={
                                <ChartTooltipContent
                                    formatter={(
                                        value: unknown,
                                        name: unknown,
                                    ) => (
                                        <span className="flex w-full justify-between gap-3">
                                            <span className="text-muted-foreground">
                                                {String(name)}
                                            </span>
                                            <span className="font-mono font-medium">
                                                {Eur.formatWhole(Number(value))}
                                            </span>
                                        </span>
                                    )}
                                />
                            }
                        />
                        <Bar
                            dataKey="in"
                            fill="var(--color-in)"
                            name="IN"
                            radius={CHART_BAR_RADIUS}
                            stackId="stack"
                        />
                        <Bar
                            dataKey="out"
                            fill="var(--color-out)"
                            name="OUT"
                            radius={CHART_BAR_RADIUS}
                            stackId="stack"
                        />
                    </BarChart>
                </ChartContainer>
            </ToolPanel>

            <ToolPanel
                description="The largest counterparts by total, IN and OUT together."
                title="Top counterparts"
            >
                <ol className="m-0 flex list-none flex-col gap-3.5 p-0">
                    {topCounterparts.map((row) => (
                        <li className="flex flex-col gap-1.5" key={row.name}>
                            <div className="flex items-baseline justify-between gap-4 text-sm">
                                <span className="truncate text-ink">
                                    {row.name}
                                </span>
                                <span className="shrink-0 font-mono text-ink-muted tabular-nums">
                                    {Eur.formatWhole(row.value)}
                                </span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                                <div
                                    className="h-full rounded-full bg-camel"
                                    style={{
                                        width: `${String(
                                            largestCounterpartValue > 0
                                                ? (row.value /
                                                      largestCounterpartValue) *
                                                      FULL_WIDTH_PERCENT
                                                : 0,
                                        )}%`,
                                    }}
                                />
                            </div>
                        </li>
                    ))}
                </ol>
            </ToolPanel>
        </div>
    );
}
