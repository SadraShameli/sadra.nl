'use client';

import { useMemo } from 'react';

import { MissingValue } from '~/components/MissingValue';
import { PanelSubheading } from '~/components/PanelSubheading';
import {
    StatStrip,
    type StatStripItem,
    StatTone,
} from '~/components/StatStrip';
import { Separator } from '~/components/ui/separator';
import {
    formatCompactCurrency,
    formatCount,
    formatCurrency,
    formatPercent,
    formatR,
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
import { NO_PASS_REASON, NO_TRADE_REASON } from './missingReasons';
import { formatSignedPercent } from './signedPercent';
import { ValueOrMissing } from './ValueOrMissing';

interface RatioItemOptions {
    bench: string;
    id: string;
    label: string;
    tone: StatTone;
    value: string;
}

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
        <div className="app-prop-calculator__strategy-analysis flex flex-col gap-6">
            <section className={cn('app-prop-calculator__strategy-returns')}>
                <SectionHeader
                    description={panelDescriptions.returnsBreakdown}
                    title="Returns breakdown"
                />
                <StatStrip
                    items={[
                        {
                            caption: `${formatSignedPercent(breakdown.monthlyPct, 2)} a month · ${formatSignedPercent(breakdown.weeklyPct, 2)} a week · ${formatSignedPercent(breakdown.perTradePct, 3)} a trade, before account fees`,
                            id: 'annualized-roi',
                            label: 'Annualized ROI',
                            tone:
                                breakdown.yearlyPct > 0
                                    ? StatTone.Positive
                                    : StatTone.Negative,
                            value: `${formatSignedPercent(breakdown.yearlyPct, 2)} a year`,
                        },
                        {
                            caption: `${rrRatio.toFixed(2)}:1 reward-to-risk`,
                            id: 'avg-trade-size',
                            label: 'Avg trade size',
                            tone:
                                averageTrade === null
                                    ? StatTone.Muted
                                    : StatTone.Default,
                            value: (
                                <ValueOrMissing
                                    reason={NO_TRADE_REASON}
                                    value={
                                        averageTrade === null
                                            ? null
                                            : `+${formatCurrency(averageTrade.win)} / −${formatCurrency(averageTrade.loss)}`
                                    }
                                />
                            ),
                        },
                        {
                            caption:
                                breakdown.tradesPerPass > 0
                                    ? `${breakdown.wins}W · ${breakdown.losses}L · ${formatPercent(winrate)} WR`
                                    : 'no passing trials',
                            id: 'trades-per-pass',
                            label: 'Trades per pass',
                            value: (
                                <ValueOrMissing
                                    value={
                                        breakdown.tradesPerPass > 0
                                            ? `${breakdown.tradesPerPass} trades`
                                            : null
                                    }
                                />
                            ),
                        },
                        {
                            caption: `+${rrRatio.toFixed(2)}R win · −1.00R loss`,
                            id: 'sum-r-per-pass',
                            label: 'Sum R per pass',
                            tone:
                                breakdown.sumR > 0
                                    ? StatTone.Positive
                                    : breakdown.sumR < 0
                                      ? StatTone.Negative
                                      : StatTone.Default,
                            value: (
                                <ValueOrMissing
                                    reason={NO_PASS_REASON}
                                    value={
                                        breakdown.tradesPerPass > 0
                                            ? `${breakdown.sumR >= 0 ? '+' : ''}${breakdown.sumR.toFixed(1)}R`
                                            : null
                                    }
                                />
                            ),
                        },
                        {
                            caption: `P95 ${((result.maxDrawdownP95 / plan.accountSize) * 100).toFixed(2)}% worst`,
                            id: 'drawdown-percent',
                            label: 'Drawdown %',
                            value: `${((result.maxDrawdownP50 / plan.accountSize) * 100).toFixed(2)}% avg`,
                        },
                        {
                            caption: `across ${formatCount(result.finalBalances.length)} trials`,
                            id: 'balance-range',
                            label: 'Balance range',
                            value: `${formatCompactCurrency(breakdown.minBal)} – ${formatCompactCurrency(breakdown.maxBal)}`,
                        },
                    ]}
                />
            </section>

            <Separator className="bg-border/40" />

            <section
                className={cn('app-prop-calculator__strategy-risk-adjusted')}
            >
                <SectionHeader
                    description={panelDescriptions.riskReturn}
                    title="Risk-adjusted returns"
                />
                <StatStrip
                    items={[
                        ratioItem({
                            bench: pfBench(ratios.profitFactor),
                            id: 'profit-factor',
                            label: 'Profit factor',
                            tone: pfTone(ratios.profitFactor),
                            value: Number.isFinite(ratios.profitFactor)
                                ? ratios.profitFactor.toFixed(2)
                                : '∞',
                        }),
                        ratioItem({
                            bench: riskAdjustedRatioBench(ratios.sharpe),
                            id: 'sharpe',
                            label: 'Sharpe (ann.)',
                            tone: riskAdjustedRatioTone(ratios.sharpe),
                            value: ratios.sharpe.toFixed(2),
                        }),
                        ratioItem({
                            bench: riskAdjustedRatioBench(ratios.sortino),
                            id: 'sortino',
                            label: 'Sortino (ann.)',
                            tone: riskAdjustedRatioTone(ratios.sortino),
                            value: ratios.sortino.toFixed(2),
                        }),
                        ratioItem({
                            bench: calmarBench(ratios.calmar),
                            id: 'calmar',
                            label: 'Calmar',
                            tone: calmarTone(ratios.calmar),
                            value: ratios.calmar.toFixed(2),
                        }),
                        ratioItem({
                            bench:
                                ratios.recovery > 1
                                    ? 'net > max DD'
                                    : 'net < max DD',
                            id: 'recovery-factor',
                            label: 'Recovery factor',
                            tone:
                                ratios.recovery > 1
                                    ? StatTone.Positive
                                    : StatTone.Negative,
                            value: ratios.recovery.toFixed(2),
                        }),
                        ratioItem({
                            bench: omegaBench(ratios.omega),
                            id: 'omega',
                            label: 'Omega ratio',
                            tone: omegaTone(ratios.omega),
                            value: omegaString,
                        }),
                        ratioItem({
                            bench:
                                ratios.gainToPain > 1.5
                                    ? 'strong'
                                    : ratios.gainToPain > 1
                                      ? 'acceptable'
                                      : 'losing',
                            id: 'gain-to-pain',
                            label: 'Gain-to-pain',
                            tone: gainToPainTone(ratios.gainToPain),
                            value: Number.isFinite(ratios.gainToPain)
                                ? ratios.gainToPain.toFixed(2)
                                : '∞',
                        }),
                        ratioItem({
                            bench:
                                ratios.ulcerIndex < 3
                                    ? 'low DD pain'
                                    : ratios.ulcerIndex < 8
                                      ? 'moderate'
                                      : 'high DD pain',
                            id: 'ulcer-index',
                            label: 'Ulcer index',
                            tone: ulcerTone(ratios.ulcerIndex),
                            value: ratios.ulcerIndex.toFixed(1),
                        }),
                    ]}
                />
            </section>

            <Separator className="bg-border/40" />

            <section className={cn('app-prop-calculator__strategy-edge')}>
                <SectionHeader
                    description={panelDescriptions.strategyDNA}
                    title="Edge"
                />
                <div className="flex flex-col gap-6">
                    <div className="flex flex-col gap-3">
                        <PanelSubheading as="h4">Expectancy</PanelSubheading>
                        <StatStrip
                            items={[
                                {
                                    id: 'per-trade-r',
                                    label: 'Per trade (R)',
                                    tone:
                                        result.expectancyR > 0
                                            ? StatTone.Positive
                                            : StatTone.Negative,
                                    value: formatR(result.expectancyR),
                                },
                                {
                                    id: 'per-trade-dollars',
                                    label: 'Per trade ($)',
                                    tone:
                                        result.expectancyDollars > 0
                                            ? StatTone.Positive
                                            : StatTone.Negative,
                                    value: formatCurrency(
                                        result.expectancyDollars,
                                    ),
                                },
                                {
                                    id: 'break-even-wr',
                                    label: 'Break-even WR',
                                    value: formatPercent(edge.breakEvenWR),
                                },
                                {
                                    id: 'edge-margin',
                                    label: 'Edge margin',
                                    tone:
                                        edge.edgeMargin > 0
                                            ? StatTone.Positive
                                            : StatTone.Negative,
                                    value: `${edge.edgeMargin > 0 ? '+' : ''}${(edge.edgeMargin * 100).toFixed(1)}pp`,
                                },
                                {
                                    caption: 'EV per attempt / attempt cost',
                                    id: 'edge-leverage',
                                    label: 'Edge leverage',
                                    tone:
                                        edgeLeverage === null
                                            ? StatTone.Muted
                                            : edgeLeverage > 0
                                              ? StatTone.Positive
                                              : StatTone.Negative,
                                    value: (
                                        <ValueOrMissing
                                            value={
                                                edgeLeverage === null
                                                    ? null
                                                    : `${edgeLeverage.toFixed(2)}×`
                                            }
                                        />
                                    ),
                                },
                                {
                                    id: 'net-r-to-pass',
                                    label: 'Net R to pass',
                                    tone:
                                        netRToPass === null
                                            ? StatTone.Muted
                                            : StatTone.Default,
                                    value: (
                                        <ValueOrMissing
                                            value={
                                                netRToPass === null
                                                    ? null
                                                    : `${netRToPass.toFixed(1)}R`
                                            }
                                        />
                                    ),
                                },
                            ]}
                        />
                    </div>
                    <div className="flex flex-col gap-3">
                        <PanelSubheading as="h4">
                            Edge confidence
                        </PanelSubheading>
                        <StatStrip
                            items={[
                                {
                                    id: 'trades-per-eval',
                                    label: 'Trades / eval (P50)',
                                    value: String(
                                        Math.round(
                                            result.tradesPerSuccessfulAttempt,
                                        ),
                                    ),
                                },
                                ...zScoreItems(edge.zScore, edge.minTrades),
                            ]}
                        />
                    </div>
                    <div className="flex flex-col gap-3">
                        <PanelSubheading as="h4">
                            Kelly (information only)
                        </PanelSubheading>
                        <p className="text-xs text-muted-foreground">
                            Size by the documented eval and funded rules: evals
                            risk the most the plan&apos;s limits allow, funded
                            accounts risk a fixed amount.{' '}
                            {
                                ECONOMICS_DISCLOSURE_TEXT[
                                    EconomicsDisclosure.KellyNotPropSizing
                                ]
                            }
                            .
                        </p>
                        <StatStrip
                            items={[
                                {
                                    caption: drawdownBasis,
                                    id: 'full-kelly',
                                    label: 'Full Kelly',
                                    value: kellyFractionText(kelly.fullKelly),
                                },
                                {
                                    caption: drawdownBasis,
                                    id: 'half-kelly',
                                    label: 'Half Kelly',
                                    value: kellyFractionText(kelly.halfKelly),
                                },
                                {
                                    caption: averageRiskBasis,
                                    id: 'average-risk',
                                    label: 'Average risk',
                                    value: (
                                        <ValueOrMissing
                                            reason={NO_TRADE_REASON}
                                            value={
                                                kelly.currentRiskFraction ===
                                                null
                                                    ? null
                                                    : formatPercent(
                                                          kelly.currentRiskFraction,
                                                      )
                                            }
                                        />
                                    ),
                                },
                                kellyIndexItem(
                                    `average risk over full Kelly, both ${drawdownBasis}`,
                                    kelly.kellyIndex,
                                ),
                            ]}
                        />
                    </div>
                </div>
            </section>
        </div>
    );
}

function calmarBench(v: number): string {
    if (v > 3) return 'excellent';
    if (v > 2) return 'good';
    return v > 1 ? 'acceptable' : 'poor';
}

function calmarTone(v: number): StatTone {
    if (v > 3 || v > 2) return StatTone.Positive;
    return v > 1 ? StatTone.Warning : StatTone.Negative;
}

function gainToPainTone(v: number): StatTone {
    if (v > 3 || v > 1.5) return StatTone.Positive;
    return v > 1 ? StatTone.Warning : StatTone.Negative;
}

function kellyIndexItem(basis: string, index: KellyIndex): StatStripItem {
    switch (index.status) {
        case KellyIndexStatus.NoEdge: {
            return {
                id: 'kelly-index',
                label: 'Kelly index',
                value: 'no edge',
            };
        }
        case KellyIndexStatus.NotApplicable: {
            return {
                id: 'kelly-index',
                label: 'Kelly index',
                tone: StatTone.Muted,
                value: <MissingValue reason={NO_TRADE_REASON} />,
            };
        }
        case KellyIndexStatus.Sized: {
            return {
                caption: basis,
                id: 'kelly-index',
                label: 'Kelly index',
                value: `${index.value.toFixed(2)}× full Kelly`,
            };
        }
    }
}

function omegaBench(v: number): string {
    if (v > 2) return 'strong';
    return v > 1 ? 'acceptable' : 'losing';
}
function omegaTone(v: number): StatTone {
    if (v > 2) return StatTone.Positive;
    return v > 1 ? StatTone.Warning : StatTone.Negative;
}
function pfBench(v: number): string {
    if (v > 1.5) return 'healthy';
    return v > 1 ? 'marginal' : 'losing';
}
function pfTone(v: number): StatTone {
    if (v > 1.5) return StatTone.Positive;
    return v > 1 ? StatTone.Warning : StatTone.Negative;
}
function ratioItem({
    bench,
    id,
    label,
    tone,
    value,
}: RatioItemOptions): StatStripItem {
    return {
        caption: bench,
        id,
        label,
        tone,
        value,
    };
}
function riskAdjustedRatioBench(v: number): string {
    if (v > 2) return 'excellent';
    if (v > 1) return 'good';
    return v > 0.5 ? 'acceptable' : 'poor';
}
function riskAdjustedRatioTone(v: number): StatTone {
    if (v > 2 || v > 1) return StatTone.Positive;
    return v > 0.5 ? StatTone.Warning : StatTone.Negative;
}
function SectionHeader({
    description,
    title,
}: {
    description: string;
    title: string;
}) {
    return <PanelSubheading info={description}>{title}</PanelSubheading>;
}
function ulcerTone(v: number): StatTone {
    if (v < 3) return StatTone.Positive;
    return v < 8 ? StatTone.Warning : StatTone.Negative;
}
function zLabel(z: number): string {
    if (z >= 1.645) return 'strong (95% CI)';
    return z >= 1.28 ? 'moderate (80% CI)' : 'weak';
}

function zScoreItems(
    zScore: null | number,
    minTrades: null | number,
): StatStripItem[] {
    if (zScore === null) {
        return [
            {
                id: 'z-score',
                label: 'Z-score',
                tone: StatTone.Muted,
                value: 'no edge',
            },
        ];
    }
    return [
        {
            id: 'z-score',
            label: 'Z-score',
            tone: zTone(zScore),
            value: (
                <>
                    {zScore.toFixed(2)}{' '}
                    <span className="text-sm">({zLabel(zScore)})</span>
                </>
            ),
        },
        {
            id: 'min-trades',
            label: 'Min trades (95% CI)',
            value: (
                <ValueOrMissing
                    value={minTrades === null ? null : String(minTrades)}
                />
            ),
        },
    ];
}

function zTone(z: number): StatTone {
    if (z >= 1.645) return StatTone.Positive;
    return z >= 1.28 ? StatTone.Warning : StatTone.Negative;
}
