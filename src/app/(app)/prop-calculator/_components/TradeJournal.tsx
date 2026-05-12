'use client';

import { useMemo, useState } from 'react';

import {
    CartesianGrid,
    Line,
    LineChart,
    ReferenceLine,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

import { cn } from '~/lib/utils';

import { Card } from '~/components/ui/Card';
import { ChartContainer, type ChartConfig } from '~/components/ui/Chart';

import { formatPercent, formatR } from './helpers';
import InfoPopover from './InfoPopover';

const PLACEHOLDER = `Paste your trade results in R-multiples, one per line or comma-separated.

Examples:
+2.5, -1, +1.8, -1, -1, +3.2, -1, +1.5
or
2.5
-1
-1
+1.8`;

function parseTradeInput(raw: string): number[] {
    return raw
        .split(/[\n,;]+/)
        .map((s) => s.trim().replace(/[^0-9.+-]/g, ''))
        .filter((s) => s.length > 0 && !isNaN(Number(s)))
        .map(Number)
        .filter(isFinite);
}

interface JournalStats {
    n: number;
    wins: number;
    losses: number;
    winrate: number;
    avgWin: number;
    avgLoss: number;
    rrActual: number;
    expectancy: number;
    profitFactor: number;
    totalR: number;
    breakEvenWR: number;
    edgeMargin: number;
    zScore: number | null;
    minTrades95: number | null;
    equityCurve: { trade: number; cumR: number }[];
    rollingWR: { trade: number; wr20: number }[];
}

function computeStats(trades: number[]): JournalStats {
    const n = trades.length;
    const winsArr = trades.filter((r) => r > 0);
    const lossArr = trades.filter((r) => r <= 0);
    const wins = winsArr.length;
    const losses = lossArr.length;
    const winrate = n > 0 ? wins / n : 0;
    const avgWin = wins > 0 ? winsArr.reduce((s, v) => s + v, 0) / wins : 0;
    const avgLoss =
        losses > 0 ? -lossArr.reduce((s, v) => s + v, 0) / losses : 0;
    const rrActual = avgLoss > 0 ? avgWin / avgLoss : 0;
    const expectancy = winrate * avgWin - (1 - winrate) * avgLoss;
    const sumWins = winsArr.reduce((s, v) => s + v, 0);
    const sumLoss = Math.abs(lossArr.reduce((s, v) => s + v, 0));
    const profitFactor =
        sumLoss > 0 ? sumWins / sumLoss : sumWins > 0 ? Infinity : 0;
    const totalR = trades.reduce((s, v) => s + v, 0);
    const breakEvenWR = avgLoss > 0 ? avgLoss / (avgWin + avgLoss) : 0;
    const edgeMargin = winrate - breakEvenWR;
    const denom = breakEvenWR * (1 - breakEvenWR);
    const zScore =
        edgeMargin > 0 && n > 0 && denom > 0
            ? edgeMargin / Math.sqrt(denom / n)
            : null;
    const minTrades95 =
        edgeMargin > 0 && denom > 0
            ? Math.ceil((1.645 / edgeMargin) ** 2 * denom)
            : null;

    let cumR = 0;
    const equityCurve = trades.map((r, i) => {
        cumR += r;
        return { trade: i + 1, cumR: +cumR.toFixed(3) };
    });
    equityCurve.unshift({ trade: 0, cumR: 0 });

    const WINDOW = 20;
    const rollingWR = trades.slice(WINDOW - 1).map((_, i) => {
        const window = trades.slice(i, i + WINDOW);
        return {
            trade: i + WINDOW,
            wr20: window.filter((r) => r > 0).length / WINDOW,
        };
    });

    return {
        n,
        wins,
        losses,
        winrate,
        avgWin,
        avgLoss,
        rrActual,
        expectancy,
        profitFactor,
        totalR,
        breakEvenWR,
        edgeMargin,
        zScore,
        minTrades95,
        equityCurve,
        rollingWR,
    };
}

const equityConfig: ChartConfig = {
    cumR: { label: 'Cumulative R', color: 'hsl(142 76% 45%)' },
};
const rollingConfig: ChartConfig = {
    wr20: { label: '20-trade WR', color: 'hsl(217 91% 60%)' },
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
        <div className="flex flex-col gap-0.5">
            <span className="text-[11px] text-muted-foreground">{label}</span>
            <span
                className={cn(
                    'font-mono text-sm font-semibold tabular-nums',
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

export default function TradeJournal() {
    const [raw, setRaw] = useState('');

    const trades = useMemo(() => parseTradeInput(raw), [raw]);
    const stats = useMemo(
        () => (trades.length >= 2 ? computeStats(trades) : null),
        [trades],
    );

    const zClass =
        !stats || stats.zScore === null
            ? 'text-muted-foreground'
            : stats.zScore >= 1.645
              ? 'text-emerald-400'
              : stats.zScore >= 1.28
                ? 'text-amber-400'
                : 'text-rose-400';

    const pfClass = !stats
        ? ''
        : stats.profitFactor > 1.5
          ? 'text-emerald-400'
          : stats.profitFactor > 1
            ? 'text-amber-400'
            : 'text-rose-400';

    const expClass = !stats
        ? ''
        : stats.expectancy > 0
          ? 'text-emerald-400'
          : 'text-rose-400';

    return (
        <Card className="px-5 py-5">
            <div className="mb-4 flex items-center gap-2">
                <h3 className="text-sm font-semibold">
                    Trade Journal & Edge Verifier
                </h3>
                <InfoPopover title="Trade Journal & Edge Verifier">
                    Paste your actual trade results as R-multiples (profit or
                    loss measured in units of your initial risk per trade). The
                    tool computes your real winrate, actual reward-to-risk,
                    statistical significance of your edge (Z-score), and a
                    rolling 20-trade winrate chart to detect edge drift. Use
                    this to compare your real performance to your simulator
                    assumptions.
                </InfoPopover>
            </div>

            <div className="flex flex-col gap-5">
                <textarea
                    value={raw}
                    onChange={(e) => setRaw(e.target.value)}
                    placeholder={PLACEHOLDER}
                    rows={5}
                    className="w-full resize-y rounded-md border border-border bg-muted/20 px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary focus:outline-none"
                />

                {trades.length > 0 && trades.length < 2 && (
                    <p className="text-xs text-muted-foreground">
                        Enter at least 2 trades to see statistics.
                    </p>
                )}

                {stats && (
                    <>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
                            <StatCell
                                label="Trades"
                                value={String(stats.n)}
                                sub={`${stats.wins}W · ${stats.losses}L`}
                            />
                            <StatCell
                                label="Win rate (actual)"
                                value={formatPercent(stats.winrate)}
                                sub={`break-even: ${formatPercent(stats.breakEvenWR)}`}
                                valueClass={
                                    stats.edgeMargin > 0
                                        ? 'text-emerald-400'
                                        : 'text-rose-400'
                                }
                            />
                            <StatCell
                                label="Avg RR (actual)"
                                value={`${stats.rrActual.toFixed(2)}:1`}
                                sub={`+${stats.avgWin.toFixed(2)}R win · −${stats.avgLoss.toFixed(2)}R loss`}
                            />
                            <StatCell
                                label="Expectancy"
                                value={formatR(stats.expectancy)}
                                sub="per trade"
                                valueClass={expClass}
                            />
                            <StatCell
                                label="Profit factor"
                                value={
                                    !isFinite(stats.profitFactor)
                                        ? '∞'
                                        : stats.profitFactor.toFixed(2)
                                }
                                sub={
                                    stats.profitFactor > 1.5
                                        ? 'healthy'
                                        : stats.profitFactor > 1
                                          ? 'marginal'
                                          : 'losing'
                                }
                                valueClass={pfClass}
                            />
                            <StatCell
                                label="Total R"
                                value={`${stats.totalR >= 0 ? '+' : ''}${stats.totalR.toFixed(2)}R`}
                                valueClass={
                                    stats.totalR > 0
                                        ? 'text-emerald-400'
                                        : 'text-rose-400'
                                }
                            />
                            <StatCell
                                label="Z-score"
                                value={
                                    stats.zScore !== null
                                        ? stats.zScore.toFixed(2)
                                        : 'N/A'
                                }
                                sub={
                                    stats.zScore === null
                                        ? 'no edge detected'
                                        : stats.zScore >= 1.645
                                          ? 'strong (95% CI)'
                                          : stats.zScore >= 1.28
                                            ? 'moderate (80% CI)'
                                            : 'weak — need more trades'
                                }
                                valueClass={zClass}
                            />
                            <StatCell
                                label="Min trades (95% CI)"
                                value={
                                    stats.minTrades95 !== null
                                        ? String(stats.minTrades95)
                                        : '—'
                                }
                                sub={
                                    stats.n >= (stats.minTrades95 ?? Infinity)
                                        ? '✓ reached'
                                        : stats.minTrades95 !== null
                                          ? `${stats.minTrades95 - stats.n} more needed`
                                          : ''
                                }
                                valueClass={
                                    stats.minTrades95 !== null &&
                                    stats.n >= stats.minTrades95
                                        ? 'text-emerald-400'
                                        : 'text-muted-foreground'
                                }
                            />
                        </div>

                        <div className="grid gap-5 lg:grid-cols-2">
                            <div>
                                <p className="mb-2 text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase">
                                    Cumulative R equity curve
                                </p>
                                <ChartContainer
                                    config={equityConfig}
                                    className="h-48 w-full"
                                >
                                    <LineChart
                                        data={stats.equityCurve}
                                        margin={{
                                            top: 4,
                                            right: 8,
                                            left: 0,
                                            bottom: 4,
                                        }}
                                    >
                                        <CartesianGrid
                                            strokeDasharray="3 3"
                                            stroke="#ccc"
                                            opacity={0.2}
                                        />
                                        <XAxis
                                            dataKey="trade"
                                            tickLine={false}
                                            axisLine={false}
                                            tick={{ fontSize: 10 }}
                                        />
                                        <YAxis
                                            tickLine={false}
                                            axisLine={false}
                                            width={36}
                                            tick={{ fontSize: 10 }}
                                            tickFormatter={(v: number) =>
                                                `${v > 0 ? '+' : ''}${v.toFixed(1)}R`
                                            }
                                        />
                                        <ReferenceLine
                                            y={0}
                                            stroke="hsl(var(--muted-foreground))"
                                            strokeDasharray="4 2"
                                            strokeOpacity={0.5}
                                        />
                                        <Tooltip
                                            formatter={(v: any) => {
                                                const n = v as number;
                                                return [
                                                    `${n >= 0 ? '+' : ''}${n.toFixed(2)}R`,
                                                    'Cumulative R',
                                                ];
                                            }}
                                            labelFormatter={(l: any) =>
                                                `Trade #${l as number}`
                                            }
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="cumR"
                                            stroke="hsl(142 76% 45%)"
                                            strokeWidth={1.5}
                                            dot={false}
                                            isAnimationActive={false}
                                        />
                                    </LineChart>
                                </ChartContainer>
                            </div>

                            {stats.rollingWR.length >= 3 && (
                                <div>
                                    <p className="mb-2 text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase">
                                        Rolling 20-trade win rate (edge drift)
                                    </p>
                                    <ChartContainer
                                        config={rollingConfig}
                                        className="h-48 w-full"
                                    >
                                        <LineChart
                                            data={stats.rollingWR}
                                            margin={{
                                                top: 4,
                                                right: 8,
                                                left: 0,
                                                bottom: 4,
                                            }}
                                        >
                                            <CartesianGrid
                                                strokeDasharray="3 3"
                                                stroke="#ccc"
                                                opacity={0.2}
                                            />
                                            <XAxis
                                                dataKey="trade"
                                                tickLine={false}
                                                axisLine={false}
                                                tick={{ fontSize: 10 }}
                                            />
                                            <YAxis
                                                tickLine={false}
                                                axisLine={false}
                                                width={36}
                                                domain={[0, 1]}
                                                tick={{ fontSize: 10 }}
                                                tickFormatter={(v: number) =>
                                                    formatPercent(v)
                                                }
                                            />
                                            <ReferenceLine
                                                y={stats.breakEvenWR}
                                                stroke="hsl(var(--destructive))"
                                                strokeDasharray="4 2"
                                                strokeOpacity={0.7}
                                                label={{
                                                    value: 'Break-even',
                                                    fontSize: 10,
                                                    fill: 'hsl(var(--destructive))',
                                                }}
                                            />
                                            <ReferenceLine
                                                y={stats.winrate}
                                                stroke="hsl(142 76% 45%)"
                                                strokeDasharray="4 2"
                                                strokeOpacity={0.5}
                                            />
                                            <Tooltip
                                                formatter={(v: any) => [
                                                    formatPercent(v as number),
                                                    '20-trade WR',
                                                ]}
                                                labelFormatter={(l: any) =>
                                                    `Trade #${l as number}`
                                                }
                                            />
                                            <Line
                                                type="monotone"
                                                dataKey="wr20"
                                                stroke="hsl(217 91% 60%)"
                                                strokeWidth={1.5}
                                                dot={false}
                                                isAnimationActive={false}
                                            />
                                        </LineChart>
                                    </ChartContainer>
                                    <p className="mt-1.5 text-[10px] text-muted-foreground">
                                        Red dashed = break-even WR (
                                        {formatPercent(stats.breakEvenWR)}). A
                                        flat or rising line = stable edge.
                                        Declining toward red = edge may be
                                        degrading.
                                    </p>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </Card>
    );
}
