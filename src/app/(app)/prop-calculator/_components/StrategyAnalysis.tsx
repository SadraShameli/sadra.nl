'use client';

import { useMemo } from 'react';

import Eyebrow from '~/components/Eyebrow';
import { Card } from '~/components/ui/Card';
import InfoPopover from '~/components/ui/InfoPopover';
import {
    formatCompactCurrency,
    formatCurrency,
    formatPercent,
    formatR,
    NOT_APPLICABLE,
} from '~/lib/format';
import {
    dollars,
    resolveCopyAccounts,
    type SimInputs,
    type SimOutputs,
} from '~/lib/prop-calculator';
import {
    ECONOMICS_DISCLOSURE_TEXT,
    EconomicsDisclosure,
    requiredR,
} from '~/lib/prop-calculator/economics';
import { standardDeviation } from '~/lib/prop-calculator/stats';
import { cn } from '~/lib/utilities';

import { attemptEconomicsCardModel } from './economics/attemptEconomicsModel';
import {
    averageTradeSize,
    type KellyIndex,
    KellyIndexStatus,
    kellySizing,
} from './kellySizing';
import { panelDescriptions } from './kpiDescriptions';
import StatCard from './StatCard';

interface StrategyAnalysisProperties {
    baseInputs: SimInputs;
    result: SimOutputs;
}

export default function StrategyAnalysis({
    baseInputs,
    result,
}: StrategyAnalysisProperties) {
    const { copyAccounts, fundedHorizonDays, plan, rrRatio, winrate } =
        baseInputs;
    const accounts = resolveCopyAccounts(copyAccounts);
    const drawdownAmount = plan.drawdown.amount;
    const drawdownBasis = `of the ${formatCurrency(drawdownAmount)} eval drawdown`;
    const averageRiskBasis = `${drawdownBasis}, averaged over eval and funded trades`;
    const kellyFractionText = (fractionOfDrawdown: number) =>
        fractionOfDrawdown > 0
            ? `${formatPercent(fractionOfDrawdown)} (${formatCurrency(fractionOfDrawdown * drawdownAmount)} per trade)`
            : 'no edge';
    const kelly = useMemo(
        () =>
            kellySizing(baseInputs, {
                averageRiskPerTrade: result.averageRiskPerTrade,
                riskBasis: drawdownAmount,
            }),
        [baseInputs, drawdownAmount, result.averageRiskPerTrade],
    );
    const averageTrade = useMemo(
        () => averageTradeSize(baseInputs, result),
        [baseInputs, result],
    );
    const edge = useMemo(() => {
        const breakEvenWR = 1 / (1 + rrRatio);
        const edgeMargin = winrate - breakEvenWR;

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
            edgeMargin,
            minTrades,
            zScore,
        };
    }, [winrate, rrRatio, result.tradesPerSuccessfulAttempt]);

    const edgeLeverage = useMemo(() => {
        const model = attemptEconomicsCardModel(result, fundedHorizonDays);
        return model.economics === null || model.economics.attemptCost <= 0
            ? null
            : model.economics.expectedNetPerAttempt.value /
                  model.economics.attemptCost;
    }, [result, fundedHorizonDays]);

    const netRToPass = useMemo(() => {
        if (plan.isInstantFunded) return null;
        const required = requiredR(
            dollars(result.profitTarget),
            dollars(baseInputs.riskPerTrade),
        );
        return required.value;
    }, [plan.isInstantFunded, result.profitTarget, baseInputs.riskPerTrade]);

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
        const sdMonthly = standardDeviation(monthlyReturns);
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
        const downsideDevelopment = Math.sqrt(
            downsideSumSq / (monthlyReturns.length || 1),
        );
        const sortino =
            downsideDevelopment > 0
                ? (meanMonthly / downsideDevelopment) * Math.sqrt(12)
                : 0;

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

        let minBal = Infinity;
        let maxBal = -Infinity;
        for (const b of result.finalBalances) {
            if (b < minBal) minBal = b;
            if (b > maxBal) maxBal = b;
        }
        if (!Number.isFinite(minBal)) minBal = accountSize;
        if (!Number.isFinite(maxBal)) maxBal = accountSize;

        return {
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
        accounts,
    ]);

    const omegaString = Number.isFinite(ratios.omega)
        ? ratios.omega.toFixed(2)
        : '∞';

    return (
        <Card
            className={cn(
                'app-prop-calculator__strategy-analysis',
                'px-5 py-5',
            )}
        >
            <div className="flex items-center gap-2">
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
                            value={
                                averageTrade === null
                                    ? NOT_APPLICABLE
                                    : `+${formatCurrency(averageTrade.win)} / −${formatCurrency(averageTrade.loss)}`
                            }
                            valueClass={
                                averageTrade === null
                                    ? 'text-muted-foreground'
                                    : undefined
                            }
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
                                    : NOT_APPLICABLE
                            }
                        />
                        <Metric
                            label="Sum R per pass"
                            sub={`+${rrRatio.toFixed(2)}R win · −1.00R loss`}
                            value={
                                breakdown.tradesPerPass > 0
                                    ? `${breakdown.sumR >= 0 ? '+' : ''}${breakdown.sumR.toFixed(1)}R`
                                    : NOT_APPLICABLE
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
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        <StatCard
                            label="Profit factor"
                            sub={pfBench(ratios.profitFactor)}
                            subInheritsColor
                            value={
                                Number.isFinite(ratios.profitFactor)
                                    ? ratios.profitFactor.toFixed(2)
                                    : '∞'
                            }
                            valueClassName={pfColor(ratios.profitFactor)}
                        />
                        <StatCard
                            label="Sharpe (ann.)"
                            sub={riskAdjustedRatioBench(ratios.sharpe)}
                            subInheritsColor
                            value={ratios.sharpe.toFixed(2)}
                            valueClassName={riskAdjustedRatioColor(
                                ratios.sharpe,
                            )}
                        />
                        <StatCard
                            label="Sortino (ann.)"
                            sub={riskAdjustedRatioBench(ratios.sortino)}
                            subInheritsColor
                            value={ratios.sortino.toFixed(2)}
                            valueClassName={riskAdjustedRatioColor(
                                ratios.sortino,
                            )}
                        />
                        <StatCard
                            label="Calmar"
                            sub={calmarBench(ratios.calmar)}
                            subInheritsColor
                            value={ratios.calmar.toFixed(2)}
                            valueClassName={calmarColor(ratios.calmar)}
                        />
                        <StatCard
                            label="Recovery factor"
                            sub={
                                ratios.recovery > 1
                                    ? 'net > max DD'
                                    : 'net < max DD'
                            }
                            subInheritsColor
                            value={ratios.recovery.toFixed(2)}
                            valueClassName={
                                ratios.recovery > 1
                                    ? 'text-emerald-400'
                                    : 'text-rose-400'
                            }
                        />
                        <StatCard
                            label="Omega ratio"
                            sub={omegaBench(ratios.omega)}
                            subInheritsColor
                            value={omegaString}
                            valueClassName={omegaColor(ratios.omega)}
                        />
                        <StatCard
                            label="Gain-to-pain"
                            sub={
                                ratios.gainToPain > 1.5
                                    ? 'strong'
                                    : ratios.gainToPain > 1
                                      ? 'acceptable'
                                      : 'losing'
                            }
                            subInheritsColor
                            value={
                                Number.isFinite(ratios.gainToPain)
                                    ? ratios.gainToPain.toFixed(2)
                                    : '∞'
                            }
                            valueClassName={gainToPainColor(ratios.gainToPain)}
                        />
                        <StatCard
                            label="Ulcer index"
                            sub={
                                ratios.ulcerIndex < 3
                                    ? 'low DD pain'
                                    : ratios.ulcerIndex < 8
                                      ? 'moderate'
                                      : 'high DD pain'
                            }
                            subInheritsColor
                            value={ratios.ulcerIndex.toFixed(1)}
                            valueClassName={ulcerColor(ratios.ulcerIndex)}
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
                            <Metric
                                label="Edge leverage"
                                sub="EV per attempt / attempt cost"
                                value={
                                    edgeLeverage === null
                                        ? NOT_APPLICABLE
                                        : `${edgeLeverage.toFixed(2)}×`
                                }
                                valueClass={
                                    edgeLeverage === null
                                        ? 'text-muted-foreground'
                                        : edgeLeverage > 0
                                          ? 'text-emerald-400'
                                          : 'text-rose-400'
                                }
                            />
                            <Metric
                                label="Net R to pass"
                                value={
                                    netRToPass === null
                                        ? NOT_APPLICABLE
                                        : `${netRToPass.toFixed(1)}R`
                                }
                                valueClass={
                                    netRToPass === null
                                        ? 'text-muted-foreground'
                                        : undefined
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
                                    value={`${NOT_APPLICABLE}: no edge`}
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
                                                ? NOT_APPLICABLE
                                                : String(edge.minTrades)
                                        }
                                    />
                                </>
                            )}
                        </div>
                        <div className="flex flex-col gap-3">
                            <p className="text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase">
                                Kelly (information only)
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                                Size by the documented eval and funded rules
                                (Hard Rules 3 and 5).{' '}
                                {
                                    ECONOMICS_DISCLOSURE_TEXT[
                                        EconomicsDisclosure.KellyNotPropSizing
                                    ]
                                }
                                .
                            </p>
                            <Metric
                                label="Full Kelly"
                                sub={drawdownBasis}
                                value={kellyFractionText(kelly.fullKelly)}
                            />
                            <Metric
                                label="Half Kelly"
                                sub={drawdownBasis}
                                value={kellyFractionText(kelly.halfKelly)}
                            />
                            <Metric
                                label="Average risk"
                                sub={averageRiskBasis}
                                value={
                                    kelly.currentRiskFraction === null
                                        ? NOT_APPLICABLE
                                        : formatPercent(
                                              kelly.currentRiskFraction,
                                          )
                                }
                            />
                            <KellyIndexMetric
                                basis={`average risk over full Kelly, both ${drawdownBasis}`}
                                index={kelly.kellyIndex}
                            />
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
    return v > 1 ? 'acceptable' : 'poor';
}

function calmarColor(v: number): string {
    if (v > 3) return 'text-emerald-400';
    if (v > 2) return 'text-green-400';
    return v > 1 ? 'text-amber-400' : 'text-rose-400';
}

function gainToPainColor(v: number): string {
    if (v > 3) return 'text-emerald-400';
    if (v > 1.5) return 'text-green-400';
    return v > 1 ? 'text-amber-400' : 'text-rose-400';
}

function KellyIndexMetric({
    basis,
    index,
}: {
    basis: string;
    index: KellyIndex;
}) {
    switch (index.status) {
        case KellyIndexStatus.NoEdge: {
            return <Metric label="Kelly index" value="no edge" />;
        }
        case KellyIndexStatus.NotApplicable: {
            return (
                <Metric
                    label="Kelly index"
                    value={NOT_APPLICABLE}
                    valueClass="text-muted-foreground"
                />
            );
        }
        case KellyIndexStatus.Sized: {
            return (
                <Metric
                    label="Kelly index"
                    sub={basis}
                    value={`${index.value.toFixed(2)}× full Kelly`}
                />
            );
        }
    }
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
    return v > 1 ? 'acceptable' : 'losing';
}
function omegaColor(v: number): string {
    if (v > 2) return 'text-emerald-400';
    return v > 1 ? 'text-amber-400' : 'text-rose-400';
}
function pfBench(v: number): string {
    if (v > 1.5) return 'healthy';
    return v > 1 ? 'marginal' : 'losing';
}
function pfColor(v: number): string {
    if (v > 1.5) return 'text-emerald-400';
    return v > 1 ? 'text-amber-400' : 'text-rose-400';
}
function riskAdjustedRatioBench(v: number): string {
    if (v > 2) return 'excellent';
    if (v > 1) return 'good';
    return v > 0.5 ? 'acceptable' : 'poor';
}
function riskAdjustedRatioColor(v: number): string {
    if (v > 2) return 'text-emerald-400';
    if (v > 1) return 'text-green-400';
    return v > 0.5 ? 'text-amber-400' : 'text-rose-400';
}
function SectionHeader({
    description,
    title,
}: {
    description: string;
    title: string;
}) {
    return (
        <div className="flex items-center gap-2">
            <Eyebrow as="h4">{title}</Eyebrow>
            <InfoPopover title={title}>{description}</InfoPopover>
        </div>
    );
}
function ulcerColor(v: number): string {
    if (v < 3) return 'text-emerald-400';
    return v < 8 ? 'text-amber-400' : 'text-rose-400';
}
function zColor(z: number): string {
    if (z >= 1.645) return 'text-emerald-400';
    return z >= 1.28 ? 'text-amber-400' : 'text-rose-400';
}

function zLabel(z: number): string {
    if (z >= 1.645) return 'strong (95% CI)';
    return z >= 1.28 ? 'moderate (80% CI)' : 'weak';
}
