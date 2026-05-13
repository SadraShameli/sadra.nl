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

import { simulateCompound } from '~/lib/prop-calculator/compoundSimulator';
import { cn } from '~/lib/utils';

import { Card } from '~/components/ui/Card';
import {
    ChartContainer,
    ChartTooltip,
    type ChartConfig,
} from '~/components/ui/Chart';

import { formatCompactCurrency, formatPercent } from './helpers';
import InfoPopover from './InfoPopover';

const tooltipEntrySchema = z.object({
    dataKey: z.string(),
    value: z.number(),
});

type TooltipEntry = z.infer<typeof tooltipEntrySchema>;

interface CompoundingPanelProps {
    winrate: number;
    rrRatio: number;
    tradesPerDay: number;
    riskPercent: number;
    seed: number;
    startBalance: number;
}

const HORIZON_OPTIONS = [
    { label: '6 months', days: 126 },
    { label: '1 year', days: 252 },
    { label: '2 years', days: 504 },
    { label: '3 years', days: 756 },
] as const;

const chartConfig: ChartConfig = {
    band95: { label: 'P5–P95', color: 'hsl(142 76% 45% / 0.1)' },
    band75: { label: 'P25–P75', color: 'hsl(142 76% 45% / 0.2)' },
    median: { label: 'Median', color: 'hsl(142 76% 45%)' },
};

function StatCell({
    label,
    value,
    sub,
    valueClass,
}: {
    label: string;
    value: string;
    sub?: string;
    valueClass?: string;
}) {
    return (
        <div className="flex flex-col gap-1 rounded-md border border-border/50 bg-muted/20 px-3 py-2.5">
            <span className="text-[11px] text-muted-foreground">{label}</span>
            <span
                className={cn(
                    'font-mono text-lg leading-none font-bold tabular-nums',
                    valueClass,
                )}
            >
                {value}
            </span>
            {sub && (
                <span className="text-[10px] text-muted-foreground">{sub}</span>
            )}
        </div>
    );
}

export default function CompoundingPanel({
    winrate,
    rrRatio,
    tradesPerDay,
    riskPercent,
    seed,
    startBalance,
}: CompoundingPanelProps) {
    const [horizonIdx, setHorizonIdx] = useState(1);

    const horizon = HORIZON_OPTIONS[horizonIdx]!;

    const out = useMemo(
        () =>
            simulateCompound({
                winrate,
                rrRatio,
                tradesPerDay,
                riskFraction: riskPercent / 100,
                tradingDays: horizon.days,
                trials: 500,
                seed,
                startBalance,
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

    const chartData = out.days.map((day, i) => ({
        day,
        month: +(day / 21).toFixed(1),
        p5: out.p5[i],
        p25: out.p25[i],
        p50: out.p50[i],
        p75: out.p75[i],
        p95: out.p95[i],
        band95lo: out.p5[i],
        band75lo: out.p25[i],
    }));

    const medianFinalCAGR =
        ((out.finalP50 / startBalance) ** (252 / horizon.days) - 1) * 100;

    const fmtDays = (d: number | null) => {
        if (d === null) return '—';
        const m = d / 21;
        return m < 3 ? `${Math.round(d)}d` : `${m.toFixed(1)}mo`;
    };

    return (
        <Card className="px-5 py-5">
            <div className="mb-4 flex items-center justify-between gap-2">
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
                    {HORIZON_OPTIONS.map((h, i) => (
                        <button
                            key={h.label}
                            onClick={() => setHorizonIdx(i)}
                            className={cn(
                                'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                                i === horizonIdx
                                    ? 'bg-primary text-primary-foreground'
                                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                            )}
                        >
                            {h.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex flex-col gap-5">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    <StatCell
                        label="Median final balance"
                        value={formatCompactCurrency(out.finalP50)}
                        sub={`start: ${formatCompactCurrency(startBalance)}`}
                        valueClass={
                            out.finalP50 > startBalance
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                        }
                    />
                    <StatCell
                        label="Annualised CAGR"
                        value={`${medianFinalCAGR >= 0 ? '+' : ''}${medianFinalCAGR.toFixed(1)}%`}
                        sub="compound annual growth"
                        valueClass={
                            medianFinalCAGR > 0
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                        }
                    />
                    <StatCell
                        label="P25 final"
                        value={formatCompactCurrency(out.finalP25)}
                        sub="25th percentile outcome"
                    />
                    <StatCell
                        label="P75 final"
                        value={formatCompactCurrency(out.finalP75)}
                        sub="75th percentile outcome"
                    />
                    <StatCell
                        label="Time to 2×"
                        value={fmtDays(out.daysToDouble)}
                        sub="median trading days"
                        valueClass={
                            out.daysToDouble !== null
                                ? 'text-emerald-400'
                                : 'text-muted-foreground'
                        }
                    />
                    <StatCell
                        label="Ruin probability"
                        value={formatPercent(out.ruinProb)}
                        sub="balance drops to &lt;10%"
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
                    config={chartConfig}
                    className="aspect-16/7 min-h-125 w-full"
                >
                    <ComposedChart
                        data={chartData}
                        margin={{ top: 10, right: 12, left: 0, bottom: 28 }}
                    >
                        <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#ccc"
                            opacity={0.2}
                        />
                        <XAxis
                            dataKey="month"
                            tickLine={false}
                            axisLine={false}
                            tickMargin={6}
                            label={{
                                value: 'Months',
                                position: 'bottom',
                                offset: 12,
                                fontSize: 11,
                            }}
                            tickFormatter={(v: number) => `${v}mo`}
                        />
                        <YAxis
                            tickLine={false}
                            axisLine={false}
                            width={60}
                            tickFormatter={(v: number) =>
                                formatCompactCurrency(v)
                            }
                        />
                        <ChartTooltip
                            content={({
                                active,
                                payload,
                                label,
                            }: {
                                active?: boolean;
                                payload?: readonly unknown[];
                                label?: unknown;
                            }) => {
                                if (!active || !payload?.length) return null;
                                const keyLabel: Record<string, string> = {
                                    p95: 'P95',
                                    p75: 'P75',
                                    p50: 'Median',
                                    p25: 'P25',
                                    p5: 'P5',
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
                                            {typeof label === 'number'
                                                ? label
                                                : String(label ?? '')}
                                        </p>
                                        <div className="grid gap-1.5">
                                            {order
                                                .filter(
                                                    (k) =>
                                                        byKey[k] !== undefined,
                                                )
                                                .map((k) => (
                                                    <div
                                                        key={k}
                                                        className="flex justify-between gap-4"
                                                    >
                                                        <span className="text-muted-foreground">
                                                            {keyLabel[k]}
                                                        </span>
                                                        <span className="font-mono font-medium tabular-nums">
                                                            {formatCompactCurrency(
                                                                byKey[k]!,
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
                            type="monotone"
                            dataKey="p95"
                            stroke="none"
                            fill="hsl(142 76% 45%)"
                            fillOpacity={0.08}
                            isAnimationActive={false}
                            legendType="none"
                        />
                        <Area
                            type="monotone"
                            dataKey="p5"
                            stroke="none"
                            fill="hsl(var(--background))"
                            fillOpacity={1}
                            isAnimationActive={false}
                            legendType="none"
                        />
                        <Area
                            type="monotone"
                            dataKey="p75"
                            stroke="none"
                            fill="hsl(142 76% 45%)"
                            fillOpacity={0.18}
                            isAnimationActive={false}
                            legendType="none"
                        />
                        <Area
                            type="monotone"
                            dataKey="p25"
                            stroke="none"
                            fill="hsl(var(--background))"
                            fillOpacity={1}
                            isAnimationActive={false}
                            legendType="none"
                        />
                        <Line
                            type="monotone"
                            dataKey="p50"
                            stroke="hsl(142 76% 45%)"
                            strokeWidth={2}
                            dot={false}
                            isAnimationActive={false}
                        />
                    </ComposedChart>
                </ChartContainer>

                <p className="text-[11px] text-muted-foreground">
                    Fixed-fractional compounding at{' '}
                    <span className="font-semibold text-foreground">
                        {riskPercent.toFixed(2)}% per trade
                    </span>{' '}
                    · {tradesPerDay} trade{tradesPerDay !== 1 ? 's' : ''}/day ·
                    500 trials · shaded bands: P25–P75 (dark) and P5–P95 (light)
                </p>
            </div>
        </Card>
    );
}
