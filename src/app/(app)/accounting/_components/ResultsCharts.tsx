'use client';

import { useMemo } from 'react';
import { Bar, BarChart, Pie, PieChart, XAxis, YAxis } from 'recharts';

import type { ConversionResult } from '~/lib/accounting/core/types';

import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import {
    type ChartConfig,
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '~/components/ui/Chart';

const formatEur = (n: number) =>
    new Intl.NumberFormat('en-US', {
        currency: 'EUR',
        maximumFractionDigits: 0,
        style: 'currency',
    }).format(n);

const COLORS = [
    'hsl(199 89% 60%)',
    'hsl(262 83% 65%)',
    'hsl(142 76% 45%)',
    'hsl(45 100% 60%)',
    'hsl(0 80% 65%)',
    'hsl(217 91% 60%)',
    'hsl(330 81% 65%)',
    'hsl(24 95% 60%)',
    'hsl(220 9% 60%)',
    'hsl(60 95% 60%)',
];

const perDayConfig = {
    in: { color: 'hsl(142 76% 45%)', label: 'IN' },
    out: { color: 'hsl(0 80% 65%)', label: 'OUT' },
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
        return [...map.values()].toSorted((a, b) =>
            a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
        );
    }, [result]);

    const byCounterpart = useMemo(() => {
        const map = new Map<string, number>();
        for (const b of result.bookings) {
            map.set(
                b.counterpartName,
                (map.get(b.counterpartName) ?? 0) + b.amountEur,
            );
        }
        return [...map.entries()]
            .map(([name, value]) => ({ name, value }))
            .toSorted((a, b) => b.value - a.value)
            .slice(0, 10)
            .map((row, i) => ({ ...row, fill: COLORS[i % COLORS.length] }));
    }, [result]);

    const counterpartConfig = useMemo<ChartConfig>(() => {
        const config: ChartConfig = {
            value: { label: 'EUR' },
        };
        for (const [i, row] of byCounterpart.entries()) {
            config[row.name] = {
                color: COLORS[i % COLORS.length],
                label: row.name,
            };
        }
        return config;
    }, [byCounterpart]);

    if (result.bookings.length === 0) return null;

    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <Card>
                <CardHeader>
                    <CardTitle className="text-sm">EUR per day</CardTitle>
                </CardHeader>
                <CardContent>
                    <ChartContainer
                        className="aspect-auto h-56 w-full"
                        config={perDayConfig}
                    >
                        <BarChart data={byDay}>
                            <XAxis
                                axisLine={false}
                                dataKey="date"
                                fontSize={10}
                                tickLine={false}
                            />
                            <YAxis
                                axisLine={false}
                                fontSize={10}
                                tickFormatter={(v: number) => formatEur(v)}
                                tickLine={false}
                                width={48}
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
                                                    {formatEur(Number(value))}
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
                                radius={[2, 2, 0, 0]}
                                stackId="stack"
                            />
                            <Bar
                                dataKey="out"
                                fill="var(--color-out)"
                                name="OUT"
                                radius={[2, 2, 0, 0]}
                                stackId="stack"
                            />
                        </BarChart>
                    </ChartContainer>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-sm">
                        Top 10 counterparts (EUR)
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <ChartContainer
                        className="aspect-auto h-56 w-full"
                        config={counterpartConfig}
                    >
                        <PieChart>
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
                                                    {formatEur(Number(value))}
                                                </span>
                                            </span>
                                        )}
                                    />
                                }
                            />
                            <Pie
                                cx="50%"
                                cy="50%"
                                data={byCounterpart}
                                dataKey="value"
                                innerRadius={45}
                                nameKey="name"
                                outerRadius={80}
                                paddingAngle={2}
                                stroke="hsl(220 26% 8%)"
                            />
                        </PieChart>
                    </ChartContainer>
                </CardContent>
            </Card>
        </div>
    );
}
