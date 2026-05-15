'use client';

import { useMemo } from 'react';

import { Card } from '~/components/ui/Card';
import InfoPopover from '~/components/ui/InfoPopover';
import { formatCompactCurrency, formatPercent } from '~/lib/format';
import { type SimOutputs } from '~/lib/prop-calculator';
import { percentile } from '~/lib/prop-calculator/stats';
import { cn } from '~/lib/utils';

interface TailRiskPanelProps {
    result: SimOutputs;
}

export default function TailRiskPanel({ result }: TailRiskPanelProps) {
    const m = useMemo(() => {
        const { accountSize, finalBalances } = result;
        if (finalBalances.length === 0) return null;

        const pnls = finalBalances.map((b) => b - accountSize);
        const n = pnls.length;

        const var95 = -percentile(pnls, 5);
        const var99 = -percentile(pnls, 1);

        const tail95 = pnls.filter((p) => p < -var95);
        const cvar95 =
            tail95.length > 0
                ? -(tail95.reduce((s, v) => s + v, 0) / tail95.length)
                : var95;

        const tail99 = pnls.filter((p) => p < -var99);
        const cvar99 =
            tail99.length > 0
                ? -(tail99.reduce((s, v) => s + v, 0) / tail99.length)
                : var99;

        const p95gain = percentile(pnls, 95);
        const p05loss = Math.abs(percentile(pnls, 5));
        const tailRatio = p05loss > 0 ? p95gain / p05loss : Infinity;

        const lossProb = (threshold: number) =>
            pnls.filter((p) => p < -threshold).length / n;

        const lossProb10 = lossProb(accountSize * 0.1);
        const lossProb25 = lossProb(accountSize * 0.25);
        const lossProb50 = lossProb(accountSize * 0.5);

        const gainProb = (threshold: number) =>
            pnls.filter((p) => p > threshold).length / n;

        return {
            accountSize,
            cvar95,
            cvar99,
            gainProb10: gainProb(accountSize * 0.1),
            gainProb25: gainProb(accountSize * 0.25),
            lossProb10,
            lossProb25,
            lossProb50,
            tailRatio,
            var95,
            var99,
        };
    }, [result]);

    if (!m) return null;

    const tailRatioStr = Number.isFinite(m.tailRatio)
        ? m.tailRatio.toFixed(2)
        : '∞';
    const tailColor =
        m.tailRatio > 1.5
            ? 'text-emerald-400'
            : m.tailRatio > 1
              ? 'text-amber-400'
              : 'text-rose-400';

    return (
        <Card className={cn('app-prop-calculator__tail-risk', 'px-5 py-5')}>
            <div className="mb-4 flex items-center gap-2">
                <h3 className="text-sm font-semibold">Tail Risk</h3>
                <InfoPopover title="Tail Risk">
                    Value at Risk (VaR) and Conditional VaR (Expected Shortfall)
                    computed from the full distribution of trial outcomes. VaR
                    95% is the loss you won&apos;t exceed in 19 out of 20
                    trials. CVaR 95% is the average loss in the worst 5% of
                    outcomes — it describes the shape of the tail, not just
                    where it starts. Tail ratio compares the 95th percentile
                    gain to the 5th percentile loss; &gt; 1 means your upside
                    tail is larger than your downside tail.
                </InfoPopover>
            </div>

            <div className="flex flex-col gap-5">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
                    <StatCell
                        label="VaR 95%"
                        sub="loss in 1-of-20 trials"
                        value={formatCompactCurrency(m.var95)}
                        valueClass="text-rose-400"
                    />
                    <StatCell
                        label="CVaR 95% (ES)"
                        sub="avg loss in worst 5%"
                        value={formatCompactCurrency(m.cvar95)}
                        valueClass="text-rose-400"
                    />
                    <StatCell
                        label="VaR 99%"
                        sub="loss in 1-of-100 trials"
                        value={formatCompactCurrency(m.var99)}
                        valueClass="text-rose-500"
                    />
                    <StatCell
                        label="CVaR 99% (ES)"
                        sub="avg loss in worst 1%"
                        value={formatCompactCurrency(m.cvar99)}
                        valueClass="text-rose-500"
                    />
                    <StatCell
                        label="Tail ratio"
                        sub="upside / downside tail"
                        value={tailRatioStr}
                        valueClass={tailColor}
                    />
                </div>

                <div>
                    <p className="mb-2 text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase">
                        Loss probability
                    </p>
                    <div className="overflow-x-auto">
                        <table
                            className={cn(
                                'app-prop-calculator__tail-risk-table',
                                'w-full text-xs tabular-nums',
                            )}
                        >
                            <thead>
                                <tr className="border-b border-border/40 text-left text-muted-foreground">
                                    <th className="py-1.5 pr-6 font-medium">
                                        Scenario
                                    </th>
                                    <th className="py-1.5 pr-6 font-medium">
                                        Threshold
                                    </th>
                                    <th className="py-1.5 pr-6 font-medium">
                                        P(loss ≥ threshold)
                                    </th>
                                    <th className="py-1.5 font-medium">
                                        P(gain ≥ threshold)
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {[
                                    {
                                        gainP: m.gainProb10,
                                        label: 'Lose 10% of capital',
                                        lossP: m.lossProb10,
                                        threshold: m.accountSize * 0.1,
                                    },
                                    {
                                        gainP: m.gainProb25,
                                        label: 'Lose 25% of capital',
                                        lossP: m.lossProb25,
                                        threshold: m.accountSize * 0.25,
                                    },
                                    {
                                        gainP: null,
                                        label: 'Lose 50% of capital',
                                        lossP: m.lossProb50,
                                        threshold: m.accountSize * 0.5,
                                    },
                                ].map((row) => (
                                    <tr
                                        className="border-b border-border/20"
                                        key={row.label}
                                    >
                                        <td className="py-1.5 pr-6 text-foreground">
                                            {row.label}
                                        </td>
                                        <td className="py-1.5 pr-6 text-muted-foreground">
                                            {formatCompactCurrency(
                                                row.threshold,
                                            )}
                                        </td>
                                        <td
                                            className={cn(
                                                'py-1.5 pr-6 font-medium',
                                                row.lossP > 0.25
                                                    ? 'text-rose-400'
                                                    : row.lossP > 0.1
                                                      ? 'text-amber-400'
                                                      : 'text-emerald-400',
                                            )}
                                        >
                                            {formatPercent(row.lossP)}
                                        </td>
                                        <td
                                            className={cn(
                                                'py-1.5',
                                                row.gainP === null
                                                    ? 'text-muted-foreground'
                                                    : row.gainP > 0.5
                                                      ? 'text-emerald-400'
                                                      : row.gainP > 0.25
                                                        ? 'text-amber-400'
                                                        : 'text-muted-foreground',
                                            )}
                                        >
                                            {row.gainP === null
                                                ? '—'
                                                : formatPercent(row.gainP)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
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
                <span
                    className={cn(
                        'text-[10px]',
                        valueClass ?? 'text-muted-foreground',
                    )}
                >
                    {sub}
                </span>
            )}
        </div>
    );
}
