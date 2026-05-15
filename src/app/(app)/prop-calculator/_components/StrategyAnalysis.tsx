'use client';

import { useMemo } from 'react';

import { Card } from '~/components/ui/Card';
import InfoPopover from '~/components/ui/InfoPopover';
import {
    formatCompactCurrency,
    formatCurrency,
    formatPercent,
    formatR,
} from '~/lib/format';
import { type Plan, type SimOutputs } from '~/lib/prop-calculator';
import { cn } from '~/lib/utils';

import { panelDescriptions } from './kpiDescriptions';

interface StrategyAnalysisProps {
    copyAccounts: number;
    fundedHorizonDays: number;
    plan: Plan;
    result: SimOutputs;
    riskPerTrade: number;
    rrRatio: number;
    winrate: number;
}

export default function StrategyAnalysis({
    copyAccounts,
    fundedHorizonDays,
    plan,
    result,
    riskPerTrade,
    rrRatio,
    winrate,
}: StrategyAnalysisProps) {
    const accounts = Math.max(1, Math.floor(copyAccounts));
    const edge = useMemo(() => {
        const breakEvenWR = 1 / (1 + rrRatio);
        const edgeMargin = winrate - breakEvenWR;
        const fullKelly =
            rrRatio > 0 ? (winrate * (rrRatio + 1) - 1) / rrRatio : 0;
        const halfKelly = fullKelly / 2;
        const currentRiskPct = (riskPerTrade / plan.accountSize) * 100;
        const kellyIndex =
            fullKelly > 0 ? currentRiskPct / (fullKelly * 100) : 0;

        const hasEdge = edgeMargin > 0;
        const N = result.tradesPerSuccessfulAttempt;
        const denom = breakEvenWR * (1 - breakEvenWR);
        const zScore =
            hasEdge && N > 0 && denom > 0
                ? edgeMargin / Math.sqrt(denom / N)
                : null;
        const minTrades =
            hasEdge && denom > 0
                ? Math.ceil((1.645 / edgeMargin) ** 2 * denom)
                : null;

        return {
            breakEvenWR,
            currentRiskPct,
            edgeMargin,
            fullKelly,
            halfKelly,
            kellyIndex,
            minTrades,
            zScore,
        };
    }, [
        winrate,
        rrRatio,
        riskPerTrade,
        plan.accountSize,
        result.tradesPerSuccessfulAttempt,
    ]);

    const ratios = useMemo(() => {
        const {
            accountSize,
            expectedMonthlyNet,
            expectedNet,
            finalBalances,
            maxDrawdownP50,
            profitFactor,
        } = result;
        const perAccountMonthlyNet = expectedMonthlyNet / accounts;
        const perAccountNet = expectedNet / accounts;

        const monthsInHorizon = fundedHorizonDays / 21;
        const monthlyReturns = finalBalances.map(
            (b) => (b - accountSize) / accountSize / monthsInHorizon,
        );
        const meanMonthly =
            monthlyReturns.reduce((s, v) => s + v, 0) /
            (monthlyReturns.length || 1);
        const sdMonthly = localStdDev(monthlyReturns);
        const sharpe =
            sdMonthly > 0 ? (meanMonthly / sdMonthly) * Math.sqrt(12) : 0;

        const annualizedReturn = (perAccountMonthlyNet / accountSize) * 12;
        const maxDDFraction = maxDrawdownP50 / accountSize;
        const calmar = maxDDFraction > 0 ? annualizedReturn / maxDDFraction : 0;
        const recovery =
            maxDrawdownP50 > 0 ? perAccountNet / maxDrawdownP50 : 0;

        const gains = finalBalances.reduce(
            (s, b) => s + Math.max(b - accountSize, 0),
            0,
        );
        const losses = finalBalances.reduce(
            (s, b) => s + Math.max(accountSize - b, 0),
            0,
        );
        const omega = losses > 0 ? gains / losses : gains > 0 ? Infinity : 1;

        const downsideSumSq = monthlyReturns.reduce(
            (s, r) => s + (r < 0 ? r * r : 0),
            0,
        );
        const downsideDev = Math.sqrt(
            downsideSumSq / (monthlyReturns.length || 1),
        );
        const sortino =
            downsideDev > 0 ? (meanMonthly / downsideDev) * Math.sqrt(12) : 0;

        const sumPos = monthlyReturns.reduce((s, r) => s + Math.max(r, 0), 0);
        const sumNeg = monthlyReturns.reduce(
            (s, r) => s + Math.abs(Math.min(r, 0)),
            0,
        );
        const gainToPain =
            sumNeg > 0 ? sumPos / sumNeg : sumPos > 0 ? Infinity : 1;

        const ulcerSquares: number[] = [];
        for (const curve of result.sampleEquityCurves) {
            let peak = curve[0] ?? accountSize;
            for (const b of curve) {
                if (b > peak) peak = b;
                const ddPct = peak > 0 ? ((peak - b) / peak) * 100 : 0;
                ulcerSquares.push(ddPct * ddPct);
            }
        }
        const ulcerIndex =
            ulcerSquares.length > 0
                ? Math.sqrt(
                      ulcerSquares.reduce((s, v) => s + v, 0) /
                          ulcerSquares.length,
                  )
                : 0;

        return {
            calmar,
            gainToPain,
            omega,
            profitFactor,
            recovery,
            sharpe,
            sortino,
            ulcerIndex,
        };
    }, [result, fundedHorizonDays, accounts]);

    const breakdown = useMemo(() => {
        const accountSize = plan.accountSize;
        const perAccountMonthlyNet = result.expectedMonthlyNet / accounts;
        const yearlyPct = (perAccountMonthlyNet * 12) / accountSize;
        const monthlyPct = perAccountMonthlyNet / accountSize;
        const weeklyPct = monthlyPct / 4.2;
        const perTradePct = result.expectancyDollars / accountSize;

        const tradesPerPass = Math.round(result.tradesPerSuccessfulAttempt);
        const wins = Math.round(tradesPerPass * winrate);
        const losses = tradesPerPass - wins;
        const sumR = result.expectancyR * tradesPerPass;
        const avgWin = riskPerTrade * rrRatio;
        const avgLoss = riskPerTrade;

        let minBal = Infinity;
        let maxBal = -Infinity;
        for (const b of result.finalBalances) {
            if (b < minBal) minBal = b;
            if (b > maxBal) maxBal = b;
        }
        if (!Number.isFinite(minBal)) minBal = accountSize;
        if (!Number.isFinite(maxBal)) maxBal = accountSize;

        return {
            avgLoss,
            avgWin,
            losses,
            maxBal,
            minBal,
            monthlyPct,
            perTradePct,
            sumR,
            tradesPerPass,
            weeklyPct,
            wins,
            yearlyPct,
        };
    }, [
        plan.accountSize,
        result.expectedMonthlyNet,
        result.expectancyDollars,
        result.expectancyR,
        result.tradesPerSuccessfulAttempt,
        result.finalBalances,
        winrate,
        rrRatio,
        riskPerTrade,
        accounts,
    ]);

    const omegaStr = Number.isFinite(ratios.omega)
        ? ratios.omega.toFixed(2)
        : '∞';

    return (
        <Card
            className={cn(
                'app-prop-calculator__strategy-analysis',
                'px-5 py-5',
            )}
        >
            <div className="mb-4 flex items-center gap-2">
                <h3 className="text-sm font-semibold">Strategy Analysis</h3>
                <InfoPopover title="Strategy analysis">
                    {panelDescriptions.strategyAnalysis}
                </InfoPopover>
            </div>

            <div className="flex flex-col gap-6">
                <section
                    className={cn('app-prop-calculator__strategy-returns')}
                >
                    <SectionHeader
                        description={panelDescriptions.returnsBreakdown}
                        title="Returns Breakdown"
                    />
                    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                        <Metric
                            label="Annualized ROI"
                            sub={`${(breakdown.monthlyPct * 100).toFixed(2)}%/mo · ${(breakdown.weeklyPct * 100).toFixed(2)}%/wk · ${(breakdown.perTradePct * 100).toFixed(3)}%/trade`}
                            value={`${(breakdown.yearlyPct * 100).toFixed(2)}% / yr`}
                            valueClass={
                                breakdown.yearlyPct > 0
                                    ? 'text-emerald-400'
                                    : 'text-rose-400'
                            }
                        />
                        <Metric
                            label="Avg trade size"
                            sub={`${rrRatio.toFixed(2)}:1 reward-to-risk`}
                            value={`+${formatCurrency(breakdown.avgWin)} / −${formatCurrency(breakdown.avgLoss)}`}
                        />
                        <Metric
                            label="Trades per pass"
                            sub={
                                breakdown.tradesPerPass > 0
                                    ? `${breakdown.wins}W · ${breakdown.losses}L · ${formatPercent(winrate)} WR`
                                    : 'no passing trials'
                            }
                            value={
                                breakdown.tradesPerPass > 0
                                    ? `${breakdown.tradesPerPass} trades`
                                    : '—'
                            }
                        />
                        <Metric
                            label="Sum R per pass"
                            sub={`+${rrRatio.toFixed(2)}R win · −1.00R loss`}
                            value={
                                breakdown.tradesPerPass > 0
                                    ? `${breakdown.sumR >= 0 ? '+' : ''}${breakdown.sumR.toFixed(1)}R`
                                    : '—'
                            }
                            valueClass={
                                breakdown.sumR > 0
                                    ? 'text-emerald-400'
                                    : breakdown.sumR < 0
                                      ? 'text-rose-400'
                                      : undefined
                            }
                        />
                        <Metric
                            label="Drawdown %"
                            sub={`P95 ${((result.maxDrawdownP95 / plan.accountSize) * 100).toFixed(2)}% worst`}
                            value={`${((result.maxDrawdownP50 / plan.accountSize) * 100).toFixed(2)}% avg`}
                        />
                        <Metric
                            label="Balance range"
                            sub={`across ${result.finalBalances.length.toLocaleString()} trials`}
                            value={`${formatCompactCurrency(breakdown.minBal)} – ${formatCompactCurrency(breakdown.maxBal)}`}
                        />
                    </div>
                </section>

                <div className="border-t border-border/40" />

                <section
                    className={cn(
                        'app-prop-calculator__strategy-risk-adjusted',
                    )}
                >
                    <SectionHeader
                        description={panelDescriptions.riskReturn}
                        title="Risk-Adjusted Returns"
                    />
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <RatioCard
                            bench={pfBench(ratios.profitFactor)}
                            color={pfColor(ratios.profitFactor)}
                            label="Profit factor"
                            value={
                                Number.isFinite(ratios.profitFactor)
                                    ? ratios.profitFactor.toFixed(2)
                                    : '∞'
                            }
                        />
                        <RatioCard
                            bench={sharpeBench(ratios.sharpe)}
                            color={sharpeColor(ratios.sharpe)}
                            label="Sharpe (ann.)"
                            value={ratios.sharpe.toFixed(2)}
                        />
                        <RatioCard
                            bench={sortinoBench(ratios.sortino)}
                            color={sortinoColor(ratios.sortino)}
                            label="Sortino (ann.)"
                            value={ratios.sortino.toFixed(2)}
                        />
                        <RatioCard
                            bench={calmarBench(ratios.calmar)}
                            color={calmarColor(ratios.calmar)}
                            label="Calmar"
                            value={ratios.calmar.toFixed(2)}
                        />
                        <RatioCard
                            bench={
                                ratios.recovery > 1
                                    ? 'net > max DD'
                                    : 'net < max DD'
                            }
                            color={
                                ratios.recovery > 1
                                    ? 'text-emerald-400'
                                    : 'text-rose-400'
                            }
                            label="Recovery factor"
                            value={ratios.recovery.toFixed(2)}
                        />
                        <RatioCard
                            bench={omegaBench(ratios.omega)}
                            color={omegaColor(ratios.omega)}
                            label="Omega ratio"
                            value={omegaStr}
                        />
                        <RatioCard
                            bench={
                                ratios.gainToPain > 1.5
                                    ? 'strong'
                                    : ratios.gainToPain > 1
                                      ? 'acceptable'
                                      : 'losing'
                            }
                            color={gainToPainColor(ratios.gainToPain)}
                            label="Gain-to-pain"
                            value={
                                Number.isFinite(ratios.gainToPain)
                                    ? ratios.gainToPain.toFixed(2)
                                    : '∞'
                            }
                        />
                        <RatioCard
                            bench={
                                ratios.ulcerIndex < 3
                                    ? 'low DD pain'
                                    : ratios.ulcerIndex < 8
                                      ? 'moderate'
                                      : 'high DD pain'
                            }
                            color={ulcerColor(ratios.ulcerIndex)}
                            label="Ulcer index"
                            value={ratios.ulcerIndex.toFixed(1)}
                        />
                    </div>
                </section>

                <div className="border-t border-border/40" />

                <section className={cn('app-prop-calculator__strategy-edge')}>
                    <SectionHeader
                        description={panelDescriptions.strategyDNA}
                        title="Edge"
                    />
                    <div className="grid gap-6 sm:grid-cols-3">
                        <div className="flex flex-col gap-3">
                            <p className="text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase">
                                Expectancy
                            </p>
                            <Metric
                                label="Per trade (R)"
                                value={formatR(result.expectancyR)}
                                valueClass={
                                    result.expectancyR > 0
                                        ? 'text-emerald-400'
                                        : 'text-rose-400'
                                }
                            />
                            <Metric
                                label="Per trade ($)"
                                value={formatCurrency(result.expectancyDollars)}
                                valueClass={
                                    result.expectancyDollars > 0
                                        ? 'text-emerald-400'
                                        : 'text-rose-400'
                                }
                            />
                            <Metric
                                label="Break-even WR"
                                value={formatPercent(edge.breakEvenWR)}
                            />
                            <Metric
                                label="Edge margin"
                                value={`${edge.edgeMargin > 0 ? '+' : ''}${(edge.edgeMargin * 100).toFixed(1)}pp`}
                                valueClass={
                                    edge.edgeMargin > 0
                                        ? 'text-emerald-400'
                                        : 'text-rose-400'
                                }
                            />
                        </div>
                        <div className="flex flex-col gap-3">
                            <p className="text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase">
                                Edge confidence
                            </p>
                            <Metric
                                label="Trades / eval (P50)"
                                value={String(
                                    Math.round(
                                        result.tradesPerSuccessfulAttempt,
                                    ),
                                )}
                            />
                            {edge.zScore === null ? (
                                <Metric
                                    label="Z-score"
                                    value="N/A — no edge"
                                    valueClass="text-muted-foreground"
                                />
                            ) : (
                                <>
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-[11px] text-muted-foreground">
                                            Z-score
                                        </span>
                                        <span
                                            className={cn(
                                                'font-mono text-sm font-semibold tabular-nums',
                                                zColor(edge.zScore),
                                            )}
                                        >
                                            {edge.zScore.toFixed(2)}{' '}
                                            <span className="text-[11px] font-normal">
                                                ({zLabel(edge.zScore)})
                                            </span>
                                        </span>
                                    </div>
                                    <Metric
                                        label="Min trades (95% CI)"
                                        value={
                                            edge.minTrades === null
                                                ? '—'
                                                : String(edge.minTrades)
                                        }
                                    />
                                </>
                            )}
                        </div>
                        <div className="flex flex-col gap-3">
                            <p className="text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase">
                                Kelly sizing
                            </p>
                            <Metric
                                label="Full Kelly"
                                value={
                                    edge.fullKelly > 0
                                        ? formatPercent(edge.fullKelly)
                                        : 'no edge'
                                }
                            />
                            <Metric
                                label="Half Kelly (rec.)"
                                value={
                                    edge.halfKelly > 0
                                        ? formatPercent(edge.halfKelly)
                                        : 'no edge'
                                }
                            />
                            <Metric
                                label="Current risk"
                                value={formatPercent(edge.currentRiskPct / 100)}
                            />
                            {edge.fullKelly > 0 && (
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-[11px] text-muted-foreground">
                                        Kelly index
                                    </span>
                                    <span
                                        className={cn(
                                            'font-mono text-sm font-semibold tabular-nums',
                                            kellyColor(edge.kellyIndex),
                                        )}
                                    >
                                        {edge.kellyIndex.toFixed(2)}×{' '}
                                        <span className="text-[11px] font-normal">
                                            ({kellyLabel(edge.kellyIndex)})
                                        </span>
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </section>
            </div>
        </Card>
    );
}

function calmarBench(v: number): string {
    if (v > 3) return 'excellent';
    if (v > 2) return 'good';
    if (v > 1) return 'acceptable';
    return 'poor';
}

function calmarColor(v: number): string {
    if (v > 3) return 'text-emerald-400';
    if (v > 2) return 'text-green-400';
    if (v > 1) return 'text-amber-400';
    return 'text-rose-400';
}

function gainToPainColor(v: number): string {
    if (v > 3) return 'text-emerald-400';
    if (v > 1.5) return 'text-green-400';
    if (v > 1) return 'text-amber-400';
    return 'text-rose-400';
}

function kellyColor(i: number): string {
    if (i > 1) return 'text-rose-400';
    if (i > 0.75) return 'text-amber-400';
    if (i >= 0.25) return 'text-emerald-400';
    return 'text-amber-400';
}
function kellyLabel(i: number): string {
    if (i > 1) return 'over-betting';
    if (i > 0.75) return 'high variance';
    if (i >= 0.25) return 'optimal zone';
    return 'under-betting';
}
function localStdDev(arr: readonly number[]): number {
    if (arr.length === 0) return 0;
    const m = arr.reduce((s, v) => s + v, 0) / arr.length;
    return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}
function Metric({
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

function omegaBench(v: number): string {
    if (v > 2) return 'strong';
    if (v > 1) return 'acceptable';
    return 'losing';
}
function omegaColor(v: number): string {
    if (v > 2) return 'text-emerald-400';
    if (v > 1) return 'text-amber-400';
    return 'text-rose-400';
}
function pfBench(v: number): string {
    if (v > 1.5) return 'healthy';
    if (v > 1) return 'marginal';
    return 'losing';
}
function pfColor(v: number): string {
    if (v > 1.5) return 'text-emerald-400';
    if (v > 1) return 'text-amber-400';
    return 'text-rose-400';
}
function RatioCard({
    bench,
    color,
    label,
    value,
}: {
    bench: string;
    color: string;
    label: string;
    value: string;
}) {
    return (
        <div className="flex flex-col gap-1 rounded-md border border-border/50 bg-muted/20 px-3 py-2.5">
            <span className="text-[11px] text-muted-foreground">{label}</span>
            <span
                className={cn(
                    'font-mono text-lg leading-none font-bold tabular-nums',
                    color,
                )}
            >
                {value}
            </span>
            <span className={cn('text-[10px]', color)}>{bench}</span>
        </div>
    );
}
function SectionHeader({
    description,
    title,
}: {
    description: string;
    title: string;
}) {
    return (
        <div className="mb-3 flex items-center gap-2">
            <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {title}
            </h4>
            <InfoPopover title={title}>{description}</InfoPopover>
        </div>
    );
}
function sharpeBench(v: number): string {
    if (v > 2) return 'excellent';
    if (v > 1) return 'good';
    if (v > 0.5) return 'acceptable';
    return 'poor';
}
function sharpeColor(v: number): string {
    if (v > 2) return 'text-emerald-400';
    if (v > 1) return 'text-green-400';
    if (v > 0.5) return 'text-amber-400';
    return 'text-rose-400';
}
function sortinoBench(v: number): string {
    if (v > 2) return 'excellent';
    if (v > 1) return 'good';
    if (v > 0.5) return 'acceptable';
    return 'poor';
}
function sortinoColor(v: number): string {
    if (v > 2) return 'text-emerald-400';
    if (v > 1) return 'text-green-400';
    if (v > 0.5) return 'text-amber-400';
    return 'text-rose-400';
}
function ulcerColor(v: number): string {
    if (v < 3) return 'text-emerald-400';
    if (v < 8) return 'text-amber-400';
    return 'text-rose-400';
}
function zColor(z: number): string {
    if (z >= 1.645) return 'text-emerald-400';
    if (z >= 1.28) return 'text-amber-400';
    return 'text-rose-400';
}

function zLabel(z: number): string {
    if (z >= 1.645) return 'strong (95% CI)';
    if (z >= 1.28) return 'moderate (80% CI)';
    return 'weak';
}
