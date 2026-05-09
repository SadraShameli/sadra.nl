'use client';

import { useMemo } from 'react';

import { type Plan, type SimOutputs } from '~/lib/prop-calculator';
import { cn } from '~/lib/utils';

import { Card } from '~/components/ui/Card';

import { formatCurrency, formatPercent, formatR } from './helpers';
import InfoPopover from './InfoPopover';
import { panelDescriptions } from './kpiDescriptions';

interface StrategyDNAProps {
    plan: Plan;
    winrate: number;
    rrRatio: number;
    riskPerTrade: number;
    result: SimOutputs;
}

function Metric({
    label,
    value,
    valueClass,
}: {
    label: string;
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
        </div>
    );
}

function SectionLabel({ children }: { children: string }) {
    return (
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {children}
        </p>
    );
}

function kellyColor(index: number): string {
    if (index > 1.0) return 'text-rose-400';
    if (index > 0.75) return 'text-amber-400';
    if (index >= 0.25) return 'text-emerald-400';
    return 'text-amber-400';
}

function kellyLabel(index: number): string {
    if (index > 1.0) return 'over-betting';
    if (index > 0.75) return 'high variance';
    if (index >= 0.25) return 'optimal zone';
    return 'under-betting';
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

export default function StrategyDNA({
    plan,
    winrate,
    rrRatio,
    riskPerTrade,
    result,
}: StrategyDNAProps) {
    const m = useMemo(() => {
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
            edgeMargin,
            fullKelly,
            halfKelly,
            currentRiskPct,
            kellyIndex,
            hasEdge,
            zScore,
            minTrades,
        };
    }, [
        winrate,
        rrRatio,
        riskPerTrade,
        plan.accountSize,
        result.tradesPerSuccessfulAttempt,
    ]);

    return (
        <Card className="px-5 py-4">
            <div className="mb-4 flex items-center gap-2">
                <h3 className="text-sm font-semibold">Strategy Edge</h3>
                <InfoPopover title="Strategy Edge">
                    {panelDescriptions.strategyDNA}
                </InfoPopover>
            </div>

            <div className="grid gap-6 sm:grid-cols-3">
                <div className="flex flex-col gap-3">
                    <SectionLabel>Edge</SectionLabel>
                    <Metric
                        label="Expectancy (R)"
                        value={formatR(result.expectancyR)}
                        valueClass={
                            result.expectancyR > 0
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                        }
                    />
                    <Metric
                        label="Expectancy ($)"
                        value={formatCurrency(result.expectancyDollars)}
                        valueClass={
                            result.expectancyDollars > 0
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                        }
                    />
                    <Metric
                        label="Break-even WR"
                        value={formatPercent(m.breakEvenWR)}
                    />
                    <Metric
                        label="Edge margin"
                        value={`${m.edgeMargin > 0 ? '+' : ''}${(m.edgeMargin * 100).toFixed(1)}pp`}
                        valueClass={
                            m.edgeMargin > 0
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                        }
                    />
                </div>

                <div className="flex flex-col gap-3">
                    <SectionLabel>Kelly Sizing</SectionLabel>
                    <Metric
                        label="Full Kelly"
                        value={
                            m.fullKelly > 0
                                ? formatPercent(m.fullKelly)
                                : 'no edge'
                        }
                    />
                    <Metric
                        label="Half Kelly (rec.)"
                        value={
                            m.halfKelly > 0
                                ? formatPercent(m.halfKelly)
                                : 'no edge'
                        }
                    />
                    <Metric
                        label="Current risk"
                        value={formatPercent(m.currentRiskPct / 100)}
                    />
                    {m.fullKelly > 0 && (
                        <div className="flex flex-col gap-0.5">
                            <span className="text-[11px] text-muted-foreground">
                                Kelly index
                            </span>
                            <span
                                className={cn(
                                    'font-mono text-sm font-semibold tabular-nums',
                                    kellyColor(m.kellyIndex),
                                )}
                            >
                                {m.kellyIndex.toFixed(2)}×{' '}
                                <span className="text-[11px] font-normal">
                                    ({kellyLabel(m.kellyIndex)})
                                </span>
                            </span>
                        </div>
                    )}
                </div>

                <div className="flex flex-col gap-3">
                    <SectionLabel>Edge Confidence</SectionLabel>
                    <Metric
                        label="Trades / eval (P50)"
                        value={String(
                            Math.round(result.tradesPerSuccessfulAttempt),
                        )}
                    />
                    {m.zScore !== null ? (
                        <>
                            <div className="flex flex-col gap-0.5">
                                <span className="text-[11px] text-muted-foreground">
                                    Z-score
                                </span>
                                <span
                                    className={cn(
                                        'font-mono text-sm font-semibold tabular-nums',
                                        zColor(m.zScore),
                                    )}
                                >
                                    {m.zScore.toFixed(2)}{' '}
                                    <span className="text-[11px] font-normal">
                                        ({zLabel(m.zScore)})
                                    </span>
                                </span>
                            </div>
                            <Metric
                                label="Min trades (95% CI)"
                                value={
                                    m.minTrades !== null
                                        ? String(m.minTrades)
                                        : '—'
                                }
                            />
                        </>
                    ) : (
                        <Metric
                            label="Z-score"
                            value="N/A — no edge"
                            valueClass="text-muted-foreground"
                        />
                    )}
                </div>
            </div>
        </Card>
    );
}
