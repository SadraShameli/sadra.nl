'use client';

import { useEffect, useMemo, useState } from 'react';

import {
    type Plan,
    simulate,
    type SimInputs,
    type SimOutputs,
} from '~/lib/prop-calculator';
import { cn } from '~/lib/utils';

import { Card } from '~/components/ui/Card';

import {
    formatCurrency,
    formatDays,
    formatPercent,
    formatStreak,
} from './helpers';
import InfoPopover from './InfoPopover';
import { panelDescriptions } from './kpiDescriptions';

const RISK_LEVELS = [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5] as const;

interface OptimalRiskTableProps {
    plan: Plan;
    baseInputs: Omit<SimInputs, 'riskPerTrade'>;
    currentRiskPercent: number;
}

interface Row {
    riskPct: number;
    out: SimOutputs;
}

export default function OptimalRiskTable({
    plan,
    baseInputs,
    currentRiskPercent,
}: OptimalRiskTableProps) {
    const [rows, setRows] = useState<Row[]>([]);
    const [pending, setPending] = useState(false);

    const debouncedKey = useDebouncedKey(baseInputs);

    useEffect(() => {
        let cancelled = false;
        setPending(true);
        const handle = setTimeout(() => {
            const trials = Math.min(500, baseInputs.trials);
            const results: Row[] = RISK_LEVELS.map((riskPct) => {
                const riskDollars = (plan.accountSize * riskPct) / 100;
                const out = simulate({
                    ...baseInputs,
                    trials,
                    riskPerTrade: riskDollars,
                });
                return { riskPct, out };
            });
            if (!cancelled) {
                setRows(results);
                setPending(false);
            }
        }, 0);
        return () => {
            cancelled = true;
            clearTimeout(handle);
        };
    }, [debouncedKey, plan, baseInputs]);

    const bestRow = useMemo(() => {
        if (rows.length === 0) return null;
        return rows.reduce((best, r) =>
            r.out.expectedMonthlyNet > best.out.expectedMonthlyNet ? r : best,
        );
    }, [rows]);

    return (
        <Card className="px-5 py-4">
            <div className="mb-3 flex items-baseline justify-between gap-2">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">
                        Optimal risk sweep
                    </h3>
                    <InfoPopover title="Optimal risk sweep">
                        {panelDescriptions.optimalRiskSweep}
                    </InfoPopover>
                </div>
                <span className="text-xs text-muted-foreground">
                    {pending
                        ? 'computing…'
                        : `best monthly net at ${formatPercent(
                              (bestRow?.riskPct ?? 0) / 100,
                              2,
                          )}`}
                </span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full min-w-max text-xs whitespace-nowrap tabular-nums">
                    <thead className="text-muted-foreground">
                        <tr className="text-left">
                            <th className="py-1 pr-3 font-medium">Risk</th>
                            <th className="py-1 pr-3 font-medium">Pass%</th>
                            <th className="py-1 pr-3 font-medium">Bust%</th>
                            <th className="py-1 pr-3 font-medium">Days P50</th>
                            <th className="py-1 pr-3 font-medium">
                                Monthly net
                            </th>
                            <th className="py-1 pr-3 font-medium">ROI</th>
                            <th className="py-1 pr-3 font-medium">
                                Streak P95
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(({ riskPct, out }) => {
                            const isCurrent =
                                Math.abs(riskPct - currentRiskPercent) < 0.01;
                            const isBest = bestRow?.riskPct === riskPct;
                            return (
                                <tr
                                    key={riskPct}
                                    className={cn(
                                        'border-t border-border/40 transition-colors',
                                        isCurrent &&
                                            'bg-primary/10 font-semibold text-foreground',
                                    )}
                                >
                                    <td className="py-1.5 pr-3">
                                        {riskPct}%
                                        {isBest && !isCurrent && (
                                            <span className="ml-1 text-emerald-400">
                                                ★
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-1.5 pr-3">
                                        {formatPercent(out.passProbability)}
                                    </td>
                                    <td className="py-1.5 pr-3">
                                        {formatPercent(out.bustProbability)}
                                    </td>
                                    <td className="py-1.5 pr-3">
                                        {formatDays(out.daysToPassP50)}
                                    </td>
                                    <td className="py-1.5 pr-3">
                                        {formatCurrency(
                                            out.expectedMonthlyNet,
                                        )}
                                    </td>
                                    <td className="py-1.5 pr-3">
                                        {formatPercent(out.roiOnCost)}
                                    </td>
                                    <td className="py-1.5 pr-3">
                                        {formatStreak(out.maxLosingStreakP95)}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </Card>
    );
}

function useDebouncedKey(inputs: Omit<SimInputs, 'riskPerTrade'>): string {
    const key = JSON.stringify({
        firmId: inputs.plan.id,
        winrate: inputs.winrate,
        rr: inputs.rrRatio,
        tpd: inputs.tradesPerDay,
        max: inputs.maxEvalDays,
        funded: inputs.fundedHorizonDays,
        seed: inputs.seed,
        commission: inputs.commissionPerRoundTrip ?? 0,
        attempts: inputs.maxAttempts ?? 1,
        eval: inputs.discounts?.evalPercent ?? 0,
        act: inputs.discounts?.activationPercent ?? 0,
    });
    const [debounced, setDebounced] = useState(key);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(key), 500);
        return () => clearTimeout(t);
    }, [key]);
    return debounced;
}
