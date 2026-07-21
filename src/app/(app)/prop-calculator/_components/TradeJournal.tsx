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

import { Card } from '~/components/ui/Card';
import { type ChartConfig, ChartContainer } from '~/components/ui/Chart';
import InfoPopover from '~/components/ui/InfoPopover';
import { formatPercent, formatR } from '~/lib/format';
import { cn } from '~/lib/utilities';

const PLACEHOLDER = `Paste your trade results in R-multiples, one per line or comma-separated.

Examples:
+2.5, -1, +1.8, -1, -1, +3.2, -1, +1.5
or
2.5
-1
-1
+1.8`;

interface JournalStats {
    avgLoss: number;
    avgWin: number;
    breakEvenWR: number;
    edgeMargin: number;
    equityCurve: { cumR: number; trade: number }[];
    expectancy: number;
    losses: number;
    minTrades95: null | number;
    n: number;
    profitFactor: number;
    rollingWR: { trade: number; wr20: number }[];
    rrActual: number;
    totalR: number;
    winrate: number;
    wins: number;
    zScore: null | number;
}

function computeStats(trades: number[]): JournalStats {
    const n = trades.length;
    const winsArray = trades.filter((r) => r > 0);
    const lossArray = trades.filter((r) => r <= 0);
    const wins = winsArray.length;
    const losses = lossArray.length;
    const winrate = n > 0 ? wins / n : 0;
    const avgWin = wins > 0 ? winsArray.reduce((s, v) => s + v, 0) / wins : 0;
    const avgLoss =
        losses > 0 ? -lossArray.reduce((s, v) => s + v, 0) / losses : 0;
    const rrActual = avgLoss > 0 ? avgWin / avgLoss : 0;
    const expectancy = winrate * avgWin - (1 - winrate) * avgLoss;
    const sumWins = winsArray.reduce((s, v) => s + v, 0);
    const sumLoss = Math.abs(lossArray.reduce((s, v) => s + v, 0));
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
    const equityCurve = trades.map((r, index) => {
        cumR += r;
        return { cumR: +cumR.toFixed(3), trade: index + 1 };
    });
    equityCurve.unshift({ cumR: 0, trade: 0 });

    const WINDOW = 20;
    const rollingWR = trades.slice(WINDOW - 1).map((_, index) => {
        const window = trades.slice(index, index + WINDOW);
        return {
            trade: index + WINDOW,
            wr20: window.filter((r) => r > 0).length / WINDOW,
        };
    });

    return {
        avgLoss,
        avgWin,
        breakEvenWR,
        edgeMargin,
        equityCurve,
        expectancy,
        losses,
        minTrades95,
        n,
        profitFactor,
        rollingWR,
        rrActual,
        totalR,
        winrate,
        wins,
        zScore,
    };
}

function parseTradeInput(raw: string): number[] {
    return raw
        .split(/[\n,;]+/)
        .map((s) => s.trim().replaceAll(/[^0-9.+-]/g, ''))
        .filter((s) => s.length > 0 && !Number.isNaN(Number(s)))
        .map(Number)
        .filter(Number.isFinite);
}

const equityConfig: ChartConfig = {
    cumR: { color: 'hsl(142 76% 45%)', label: 'Cumulative R' },
};
const rollingConfig: ChartConfig = {
    wr20: { color: 'hsl(217 91% 60%)', label: '20-trade WR' },
};

export default function TradeJournal() {
    const [raw, setRaw] = useState('');

    const trades = useMemo(() => parseTradeInput(raw), [raw]);
    const stats = useMemo(
        () => (trades.length >= 2 ? computeStats(trades) : null),
        [trades],
    );

    const zClass =
        stats?.zScore == null
            ? 'text-muted-foreground'
            : stats.zScore >= 1.645
              ? 'text-emerald-400'
              : stats.zScore >= 1.28
                ? 'text-amber-400'
                : 'text-rose-400';

    const pfClass = stats
        ? stats.profitFactor > 1.5
            ? 'text-emerald-400'
            : stats.profitFactor > 1
              ? 'text-amber-400'
              : 'text-rose-400'
        : '';

    const expClass = stats
        ? stats.expectancy > 0
            ? 'text-emerald-400'
            : 'text-rose-400'
        : '';

    return (
        <Card className={cn('app-prop-calculator__trade-journal', 'px-5 py-5')}>
            <div className="flex items-center gap-2">
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
                    className={cn(
                        'app-prop-calculator__trade-journal-input',
                        'w-full resize-y rounded-md border border-border bg-muted/20 px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary focus:outline-none',
                    )}
                    onChange={(event) => setRaw(event.target.value)}
                    placeholder={PLACEHOLDER}
                    rows={5}
                    value={raw}
                />

                {trades.length > 0 && trades.length < 2 && (
                    <p className="text-xs text-muted-foreground">
                        Enter at least 2 trades to see statistics.
                    </p>
                )}

                {stats && (
                    <>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3 lg:grid-cols-4">
                            <StatCell
                                label="Trades"
                                sub={`${stats.wins}W · ${stats.losses}L`}
                                value={String(stats.n)}
                            />
                            <StatCell
                                label="Win rate (actual)"
                                sub={`break-even: ${formatPercent(stats.breakEvenWR)}`}
                                value={formatPercent(stats.winrate)}
                                valueClass={
                                    stats.edgeMargin > 0
                                        ? 'text-emerald-400'
                                        : 'text-rose-400'
                                }
                            />
                            <StatCell
                                label="Avg RR (actual)"
                                sub={`+${stats.avgWin.toFixed(2)}R win · −${stats.avgLoss.toFixed(2)}R loss`}
                                value={`${stats.rrActual.toFixed(2)}:1`}
                            />
                            <StatCell
                                label="Expectancy"
                                sub="per trade"
                                value={formatR(stats.expectancy)}
                                valueClass={expClass}
                            />
                            <StatCell
                                label="Profit factor"
                                sub={
                                    stats.profitFactor > 1.5
                                        ? 'healthy'
                                        : stats.profitFactor > 1
                                          ? 'marginal'
                                          : 'losing'
                                }
                                value={
                                    Number.isFinite(stats.profitFactor)
                                        ? stats.profitFactor.toFixed(2)
                                        : '∞'
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
                                sub={
                                    stats.zScore === null
                                        ? 'no edge detected'
                                        : stats.zScore >= 1.645
                                          ? 'strong (95% CI)'
                                          : stats.zScore >= 1.28
                                            ? 'moderate (80% CI)'
                                            : 'weak — need more trades'
                                }
                                value={
                                    stats.zScore === null
                                        ? 'N/A'
                                        : stats.zScore.toFixed(2)
                                }
                                valueClass={zClass}
                            />
                            <StatCell
                                label="Min trades (95% CI)"
                                sub={
                                    stats.n >= (stats.minTrades95 ?? Infinity)
                                        ? '✓ reached'
                                        : stats.minTrades95 === null
                                          ? ''
                                          : `${stats.minTrades95 - stats.n} more needed`
                                }
                                value={
                                    stats.minTrades95 === null
                                        ? '—'
                                        : String(stats.minTrades95)
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
                            <div
                                className={cn(
                                    'app-prop-calculator__journal-equity-chart',
                                )}
                            >
                                <p className="mb-2 text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase">
                                    Cumulative R equity curve
                                </p>
                                <ChartContainer
                                    className="h-48 w-full"
                                    config={equityConfig}
                                >
                                    <LineChart
                                        data={stats.equityCurve}
                                        margin={{
                                            bottom: 4,
                                            left: 0,
                                            right: 8,
                                            top: 4,
                                        }}
                                    >
                                        <CartesianGrid
                                            opacity={0.2}
                                            stroke="#ccc"
                                            strokeDasharray="3 3"
                                        />
                                        <XAxis
                                            axisLine={false}
                                            dataKey="trade"
                                            tick={{ fontSize: 10 }}
                                            tickLine={false}
                                        />
                                        <YAxis
                                            axisLine={false}
                                            tick={{ fontSize: 10 }}
                                            tickFormatter={(v: number) =>
                                                `${v > 0 ? '+' : ''}${v.toFixed(1)}R`
                                            }
                                            tickLine={false}
                                            width={36}
                                        />
                                        <ReferenceLine
                                            stroke="hsl(var(--muted-foreground))"
                                            strokeDasharray="4 2"
                                            strokeOpacity={0.5}
                                            y={0}
                                        />
                                        <Tooltip
                                            formatter={(v: unknown) => {
                                                const n = v as number;
                                                return [
                                                    `${n >= 0 ? '+' : ''}${n.toFixed(2)}R`,
                                                    'Cumulative R',
                                                ];
                                            }}
                                            labelFormatter={(l: unknown) =>
                                                `Trade #${l as number}`
                                            }
                                        />
                                        <Line
                                            dataKey="cumR"
                                            dot={false}
                                            isAnimationActive={false}
                                            stroke="hsl(142 76% 45%)"
                                            strokeWidth={1.5}
                                            type="monotone"
                                        />
                                    </LineChart>
                                </ChartContainer>
                            </div>

                            {stats.rollingWR.length >= 3 && (
                                <div
                                    className={cn(
                                        'app-prop-calculator__journal-rolling-wr-chart',
                                    )}
                                >
                                    <p className="mb-2 text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase">
                                        Rolling 20-trade win rate (edge drift)
                                    </p>
                                    <ChartContainer
                                        className="h-48 w-full"
                                        config={rollingConfig}
                                    >
                                        <LineChart
                                            data={stats.rollingWR}
                                            margin={{
                                                bottom: 4,
                                                left: 0,
                                                right: 8,
                                                top: 4,
                                            }}
                                        >
                                            <CartesianGrid
                                                opacity={0.2}
                                                stroke="#ccc"
                                                strokeDasharray="3 3"
                                            />
                                            <XAxis
                                                axisLine={false}
                                                dataKey="trade"
                                                tick={{ fontSize: 10 }}
                                                tickLine={false}
                                            />
                                            <YAxis
                                                axisLine={false}
                                                domain={[0, 1]}
                                                tick={{ fontSize: 10 }}
                                                tickFormatter={(v: number) =>
                                                    formatPercent(v)
                                                }
                                                tickLine={false}
                                                width={36}
                                            />
                                            <ReferenceLine
                                                label={{
                                                    fill: 'hsl(var(--destructive))',
                                                    fontSize: 10,
                                                    value: 'Break-even',
                                                }}
                                                stroke="hsl(var(--destructive))"
                                                strokeDasharray="4 2"
                                                strokeOpacity={0.7}
                                                y={stats.breakEvenWR}
                                            />
                                            <ReferenceLine
                                                stroke="hsl(142 76% 45%)"
                                                strokeDasharray="4 2"
                                                strokeOpacity={0.5}
                                                y={stats.winrate}
                                            />
                                            <Tooltip
                                                formatter={(v: unknown) => [
                                                    formatPercent(v as number),
                                                    '20-trade WR',
                                                ]}
                                                labelFormatter={(l: unknown) =>
                                                    `Trade #${l as number}`
                                                }
                                            />
                                            <Line
                                                dataKey="wr20"
                                                dot={false}
                                                isAnimationActive={false}
                                                stroke="hsl(217 91% 60%)"
                                                strokeWidth={1.5}
                                                type="monotone"
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
