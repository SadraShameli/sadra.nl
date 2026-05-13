'use client';

import { useMemo } from 'react';

import { Card } from '~/components/ui/Card';
import { type Plan, type SimOutputs } from '~/lib/prop-calculator';
import { cn } from '~/lib/utils';

import { formatCurrency, formatPercent } from './helpers';
import InfoPopover from './InfoPopover';
import { panelDescriptions } from './kpiDescriptions';
import { probStreakAtLeast } from './lab/labMath';

interface ResiliencePanelProps {
    plan: Plan;
    result: SimOutputs;
    riskPerTrade: number;
    winrate: number;
}

const BASE_STREAKS = [3, 4, 5, 6, 7, 8, 10] as const;

export default function ResiliencePanel({
    plan,
    result,
    riskPerTrade,
    winrate,
}: ResiliencePanelProps) {
    const data = useMemo(() => {
        const dd = plan.drawdown.amount;
        const accountSize = plan.accountSize;
        const lossToler = riskPerTrade > 0 ? Math.floor(dd / riskPerTrade) : 0;
        const p95 = Math.round(result.maxLosingStreakP95);
        const q = 1 - winrate;
        const K = Math.round(
            result.tradesPerSuccessfulAttempt * result.expectedAttempts,
        );

        const streaks = [...BASE_STREAKS] as number[];
        if (lossToler > 0 && lossToler <= 20 && !streaks.includes(lossToler)) {
            streaks.push(lossToler);
            streaks.sort((a, b) => a - b);
        }

        const rows = streaks.map((n) => ({
            damage: Math.min(n * riskPerTrade, dd),
            isTolerance: n === lossToler,
            n,
            prob: probStreakAtLeast(K, n, q),
            survives: n * riskPerTrade <= dd,
        }));

        const safeRisk = p95 > 0 ? dd / p95 : 0;
        const safeRiskPct =
            accountSize > 0 ? (safeRisk / accountSize) * 100 : 0;

        return { lossToler, p95, rows, safeRisk, safeRiskPct };
    }, [plan, result, winrate, riskPerTrade]);

    const buffer = data.lossToler - data.p95;

    return (
        <Card className="px-5 py-4">
            <div className="mb-3 flex items-center gap-2">
                <h3 className="text-sm font-semibold">
                    Streak &amp; Drawdown Resilience
                </h3>
                <InfoPopover title="Streak & drawdown resilience">
                    {panelDescriptions.resilience}
                </InfoPopover>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-3">
                <div className="rounded-md border border-border/50 bg-muted/20 px-3 py-2">
                    <div className="text-[11px] text-muted-foreground">
                        Loss tolerance
                    </div>
                    <div className="font-mono text-xl font-bold tabular-nums">
                        {data.lossToler}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                        consecutive losses before bust
                    </div>
                </div>
                <div className="rounded-md border border-border/50 bg-muted/20 px-3 py-2">
                    <div className="text-[11px] text-muted-foreground">
                        P95 worst streak
                    </div>
                    <div className="font-mono text-xl font-bold tabular-nums">
                        {data.p95}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                        from simulation
                    </div>
                </div>
                <div
                    className={cn(
                        'rounded-md border px-3 py-2',
                        buffer >= 0
                            ? 'border-emerald-500/30 bg-emerald-500/10'
                            : 'border-rose-500/30 bg-rose-500/10',
                    )}
                >
                    <div className="text-[11px] text-muted-foreground">
                        Buffer
                    </div>
                    <div
                        className={cn(
                            'font-mono text-xl font-bold tabular-nums',
                            buffer >= 0 ? 'text-emerald-400' : 'text-rose-400',
                        )}
                    >
                        {buffer >= 0 ? `+${buffer}` : buffer}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                        {buffer >= 0 ? 'safe margin' : 'at risk'}
                    </div>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full min-w-max text-xs whitespace-nowrap tabular-nums">
                    <thead className="text-muted-foreground">
                        <tr className="text-left">
                            <th className="py-1 pr-4 font-medium">Streak</th>
                            <th className="py-1 pr-4 font-medium">
                                P(occurs in eval)
                            </th>
                            <th className="py-1 pr-4 font-medium">Damage</th>
                            <th className="py-1 pr-4 font-medium">Survive?</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.rows.map(
                            ({ damage, isTolerance, n, prob, survives }) => (
                                <tr
                                    className={cn(
                                        'border-t border-border/40',
                                        !survives &&
                                            prob > 0.05 &&
                                            'bg-rose-500/10 text-rose-400',
                                        !survives &&
                                            prob <= 0.05 &&
                                            'text-amber-400',
                                        isTolerance && 'font-semibold',
                                    )}
                                    key={n}
                                >
                                    <td className="py-1.5 pr-4">
                                        {n} in a row
                                        {isTolerance && (
                                            <span className="ml-1 text-[10px] text-muted-foreground">
                                                (bust limit)
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-1.5 pr-4">
                                        {formatPercent(prob)}
                                    </td>
                                    <td className="py-1.5 pr-4">
                                        {formatCurrency(damage)}
                                    </td>
                                    <td className="py-1.5 pr-4">
                                        {survives ? 'Yes' : 'Bust'}
                                    </td>
                                </tr>
                            ),
                        )}
                    </tbody>
                </table>
            </div>

            {data.p95 > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                    To survive your P95 worst streak ({data.p95} losses), max
                    safe risk is{' '}
                    <span className="font-mono font-semibold text-foreground">
                        {formatCurrency(data.safeRisk)}
                    </span>{' '}
                    ({data.safeRiskPct.toFixed(2)}% of account).
                </p>
            )}
        </Card>
    );
}
