'use client';

import { useMemo, useState } from 'react';
import {
    Area,
    CartesianGrid,
    ComposedChart,
    Line,
    XAxis,
    YAxis,
} from 'recharts';
import { z } from 'zod';

import { Button } from '~/components/ui/Button';
import { Card, CardContent } from '~/components/ui/Card';
import {
    type ChartConfig,
    ChartContainer,
    ChartTooltip,
} from '~/components/ui/Chart';
import InfoPopover from '~/components/ui/InfoPopover';
import { formatCompactCurrency, formatPercent } from '~/lib/format';
import { simulateCompound } from '~/lib/prop-calculator/compoundSimulator';
import { cn } from '~/lib/utils';

const tooltipEntrySchema = z.object({
    dataKey: z.string(),
    value: z.number(),
});

const fmtDays = (d: null | number) => {
    if (d === null) return '—';
    const m = d / 21;
    return m < 3 ? `${Math.round(d)}d` : `${m.toFixed(1)}mo`;
};

interface CompoundingPanelProperties {
    riskPercent: number;
    rrRatio: number;
    seed: number;
    startBalance: number;
    tradesPerDay: number;
    winrate: number;
}

type TooltipEntry = z.infer<typeof tooltipEntrySchema>;

const HORIZON_OPTIONS = [
    { days: 126, label: '6 months' },
    { days: 252, label: '1 year' },
    { days: 504, label: '2 years' },
    { days: 756, label: '3 years' },
] as const;

const chartConfig: ChartConfig = {
    band75: { color: 'hsl(142 76% 45% / 0.2)', label: 'P25–P75' },
    band95: { color: 'hsl(142 76% 45% / 0.1)', label: 'P5–P95' },
    median: { color: 'hsl(142 76% 45%)', label: 'Median' },
};

export default function CompoundingPanel({
    riskPercent,
    rrRatio,
    seed,
    startBalance,
    tradesPerDay,
    winrate,
}: CompoundingPanelProperties) {
    const [horizonIndex, setHorizonIndex] = useState(1);

    const horizon = HORIZON_OPTIONS[horizonIndex] ?? HORIZON_OPTIONS[0];

    const out = useMemo(
        () =>
            simulateCompound({
                riskFraction: riskPercent / 100,
                rrRatio,
                seed,
                startBalance,
                tradesPerDay,
                tradingDays: horizon.days,
                trials: 500,
                winrate,
            }),
        [
            winrate,
            rrRatio,
            tradesPerDay,
            riskPercent,
            seed,
            startBalance,
            horizon.days,
        ],
    );

    const chartData = out.days.map((day, index) => ({
        band75lo: out.p25[index],
        band95lo: out.p5[index],
        day,
        month: +(day / 21).toFixed(1),
        p5: out.p5[index],
        p25: out.p25[index],
        p50: out.p50[index],
        p75: out.p75[index],
        p95: out.p95[index],
    }));

    const medianFinalCAGR =
        ((out.finalP50 / startBalance) ** (252 / horizon.days) - 1) * 100;

    return (
        <Card className={cn('app-prop-calculator__compounding', 'px-5 py-5')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">
                        Compounding Growth Simulator
                    </h3>
                    <InfoPopover title="Compounding Growth Simulator">
                        Projects your funded account forward using
                        fixed-fractional compounding: you risk the same
                        percentage of your current balance on every trade, so
                        both wins and losses compound. The shaded bands show
                        P25–P75 (darker) and P5–P95 (lighter) across 500
                        simulated paths. This separates from the prop-firm
                        evaluation — it models your live account after you are
                        funded and trading indefinitely at your current edge and
                        risk settings.
                    </InfoPopover>
                </div>
                <div className="flex gap-2">
                    {HORIZON_OPTIONS.map((h, index) => (
                        <Button
                            className="h-7 px-2.5 text-xs"
                            key={h.label}
                            onClick={() => setHorizonIndex(index)}
                            size="sm"
                            type="button"
                            variant={
                                index === horizonIndex ? 'default' : 'ghost'
                            }
                        >
                            {h.label}
                        </Button>
                    ))}
                </div>
            </div>

            <div className="flex flex-col gap-5">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                    <StatCell
                        label="Median final balance"
                        sub={`start: ${formatCompactCurrency(startBalance)}`}
                        value={formatCompactCurrency(out.finalP50)}
                        valueClass={
                            out.finalP50 > startBalance
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                        }
                    />
                    <StatCell
                        label="Annualised CAGR"
                        sub="compound annual growth"
                        value={`${medianFinalCAGR >= 0 ? '+' : ''}${medianFinalCAGR.toFixed(1)}%`}
                        valueClass={
                            medianFinalCAGR > 0
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                        }
                    />
                    <StatCell
                        label="P25 final"
                        sub="25th percentile outcome"
                        value={formatCompactCurrency(out.finalP25)}
                    />
                    <StatCell
                        label="P75 final"
                        sub="75th percentile outcome"
                        value={formatCompactCurrency(out.finalP75)}
                    />
                    <StatCell
                        label="Time to 2×"
                        sub="median trading days"
                        value={fmtDays(out.daysToDouble)}
                        valueClass={
                            out.daysToDouble === null
                                ? 'text-muted-foreground'
                                : 'text-emerald-400'
                        }
                    />
                    <StatCell
                        label="Ruin probability"
                        sub="balance drops to &lt;10%"
                        value={formatPercent(out.ruinProb)}
                        valueClass={
                            out.ruinProb < 0.05
                                ? 'text-emerald-400'
                                : out.ruinProb < 0.2
                                  ? 'text-amber-400'
                                  : 'text-rose-400'
                        }
                    />
                </div>

                <ChartContainer
                    className={cn(
                        'app-prop-calculator__compounding-chart',
                        'aspect-16/7 min-h-125 w-full',
                    )}
                    config={chartConfig}
                >
                    <ComposedChart
                        data={chartData}
                        margin={{ bottom: 28, left: 0, right: 12, top: 10 }}
                    >
                        <CartesianGrid
                            opacity={0.2}
                            stroke="#ccc"
                            strokeDasharray="3 3"
                        />
                        <XAxis
                            axisLine={false}
                            dataKey="month"
                            label={{
                                fontSize: 11,
                                offset: 12,
                                position: 'bottom',
                                value: 'Months',
                            }}
                            tickFormatter={(v: number) => `${v}mo`}
                            tickLine={false}
                            tickMargin={6}
                        />
                        <YAxis
                            axisLine={false}
                            tickFormatter={(v: number) =>
                                formatCompactCurrency(v)
                            }
                            tickLine={false}
                            width={60}
                        />
                        <ChartTooltip
                            content={({
                                active,
                                label,
                                payload,
                            }: {
                                active?: boolean;
                                label?: unknown;
                                payload?: readonly unknown[];
                            }) => {
                                if (!active || !payload?.length) return null;
                                const keyLabel: Record<string, string> = {
                                    p5: 'P5',
                                    p25: 'P25',
                                    p50: 'Median',
                                    p75: 'P75',
                                    p95: 'P95',
                                };
                                const order = [
                                    'p95',
                                    'p75',
                                    'p50',
                                    'p25',
                                    'p5',
                                ];
                                const entries: TooltipEntry[] = payload.flatMap(
                                    (p) => {
                                        const r =
                                            tooltipEntrySchema.safeParse(p);
                                        return r.success ? [r.data] : [];
                                    },
                                );
                                const byKey: Record<string, number> =
                                    Object.fromEntries(
                                        entries.map((e) => [
                                            e.dataKey,
                                            e.value,
                                        ]),
                                    );
                                return (
                                    <div className="grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                                        <p className="text-xs font-medium">
                                            Month{' '}
                                            {typeof label === 'number' ||
                                            typeof label === 'string'
                                                ? label
                                                : ''}
                                        </p>
                                        <div className="grid gap-1.5">
                                            {order
                                                .filter(
                                                    (k) =>
                                                        byKey[k] !== undefined,
                                                )
                                                .map((k) => (
                                                    <div
                                                        className="flex justify-between gap-4"
                                                        key={k}
                                                    >
                                                        <span className="text-muted-foreground">
                                                            {keyLabel[k]}
                                                        </span>
                                                        <span className="font-mono font-medium tabular-nums">
                                                            {formatCompactCurrency(
                                                                byKey[k] ?? 0,
                                                            )}
                                                        </span>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                );
                            }}
                        />
                        <Area
                            dataKey="p95"
                            fill="hsl(142 76% 45%)"
                            fillOpacity={0.08}
                            isAnimationActive={false}
                            legendType="none"
                            stroke="none"
                            type="monotone"
                        />
                        <Area
                            dataKey="p5"
                            fill="hsl(var(--background))"
                            fillOpacity={1}
                            isAnimationActive={false}
                            legendType="none"
                            stroke="none"
                            type="monotone"
                        />
                        <Area
                            dataKey="p75"
                            fill="hsl(142 76% 45%)"
                            fillOpacity={0.18}
                            isAnimationActive={false}
                            legendType="none"
                            stroke="none"
                            type="monotone"
                        />
                        <Area
                            dataKey="p25"
                            fill="hsl(var(--background))"
                            fillOpacity={1}
                            isAnimationActive={false}
                            legendType="none"
                            stroke="none"
                            type="monotone"
                        />
                        <Line
                            dataKey="p50"
                            dot={false}
                            isAnimationActive={false}
                            stroke="hsl(142 76% 45%)"
                            strokeWidth={2}
                            type="monotone"
                        />
                    </ComposedChart>
                </ChartContainer>

                <p className="text-[11px] text-muted-foreground">
                    Fixed-fractional compounding at{' '}
                    <span className="font-semibold text-foreground">
                        {riskPercent.toFixed(2)}% per trade
                    </span>{' '}
                    · {tradesPerDay} trade{tradesPerDay === 1 ? '' : 's'}/day ·
                    500 trials · shaded bands: P25–P75 (dark) and P5–P95 (light)
                </p>
            </div>
        </Card>
    );
}

function StatCell({
    label,
    sub,
    value,
    valueClass,
}: {
    label: string;
    sub?: string;
    value: string;
    valueClass?: string;
}) {
    return (
        <Card className="gap-1 py-2.5">
            <CardContent className="flex flex-col gap-1 px-3">
                <span className="text-[11px] text-muted-foreground">
                    {label}
                </span>
                <span
                    className={cn(
                        'font-mono text-lg leading-none font-bold tabular-nums',
                        valueClass,
                    )}
                >
                    {value}
                </span>
                {sub && (
                    <span className="text-[10px] text-muted-foreground">
                        {sub}
                    </span>
                )}
            </CardContent>
        </Card>
    );
}
