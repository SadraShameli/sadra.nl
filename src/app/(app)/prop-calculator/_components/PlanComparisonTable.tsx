'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { Card } from '~/components/ui/Card';
import InfoPopover from '~/components/ui/InfoPopover';
import { formatCurrency, formatDays, formatPercent } from '~/lib/format';
import {
    type Plan,
    type PropFirm,
    type SimInputs,
    type SimOutputs,
    simulate,
} from '~/lib/prop-calculator';
import { cn } from '~/lib/utils';

import { panelDescriptions } from './kpiDescriptions';

interface PlanComparisonTableProps {
    activePlan: Plan;
    baseInputs: Omit<SimInputs, 'plan'>;
    firm: PropFirm;
}

interface Row {
    out: SimOutputs;
    plan: Plan;
}

export default function PlanComparisonTable({
    activePlan,
    baseInputs,
    firm,
}: PlanComparisonTableProps) {
    const [rows, setRows] = useState<Row[]>([]);
    const [pending, setPending] = useState(false);
    const inputsRef = useRef(baseInputs);
    inputsRef.current = baseInputs;
    const firmRef = useRef(firm);
    firmRef.current = firm;

    const debouncedKey = useDebouncedKey(baseInputs, firm.id, 600);

    useEffect(() => {
        let cancelled = false;
        setPending(true);
        const handle = setTimeout(() => {
            const inputs = inputsRef.current;
            const plans = firmRef.current.plans;
            const trials = Math.min(500, inputs.trials);
            const out: Row[] = plans.map((plan) => ({
                out: simulate({ ...inputs, plan, trials }),
                plan,
            }));
            if (!cancelled) {
                setRows(out);
                setPending(false);
            }
        }, 0);
        return () => {
            cancelled = true;
            clearTimeout(handle);
        };
    }, [debouncedKey]);

    const bestNet = useMemo(() => {
        if (rows.length === 0) return -Infinity;
        return Math.max(...rows.map((r) => r.out.expectedMonthlyNet));
    }, [rows]);

    return (
        <Card className="px-5 py-4">
            <div className="mb-3 flex items-baseline justify-between gap-2">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">
                        Plans within {firm.displayName}
                    </h3>
                    <InfoPopover title="Plan comparison">
                        {panelDescriptions.planComparison}
                    </InfoPopover>
                </div>
                <span className="text-xs text-muted-foreground">
                    {pending
                        ? 'computing…'
                        : `${rows.length} plan${rows.length === 1 ? '' : 's'}`}
                </span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full min-w-max text-xs whitespace-nowrap tabular-nums">
                    <thead className="text-muted-foreground">
                        <tr className="text-left">
                            <th className="py-1 pr-3 font-medium">Plan</th>
                            <th className="py-1 pr-3 font-medium">PT:DD</th>
                            <th className="py-1 pr-3 font-medium">Pass%</th>
                            <th className="py-1 pr-3 font-medium">Days</th>
                            <th className="py-1 pr-3 font-medium">
                                Exp. spend
                            </th>
                            <th className="py-1 pr-3 font-medium">
                                Monthly net
                            </th>
                            <th className="py-1 pr-3 font-medium">ROI</th>
                            <th className="py-1 pr-3 font-medium">Score</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(({ out, plan }) => {
                            const isActive = plan === activePlan;
                            const ptdd =
                                plan.profitTarget / plan.drawdown.amount;
                            const score =
                                bestNet > 0
                                    ? Math.max(
                                          1,
                                          Math.round(
                                              (out.expectedMonthlyNet /
                                                  bestNet) *
                                                  5,
                                          ),
                                      )
                                    : 1;
                            const isBest =
                                out.expectedMonthlyNet === bestNet &&
                                bestNet > -Infinity;
                            return (
                                <tr
                                    className={cn(
                                        'border-t border-border/40 transition-colors',
                                        isActive &&
                                            'bg-primary/10 font-semibold text-foreground',
                                    )}
                                    key={JSON.stringify(plan.id)}
                                >
                                    <td className="py-1.5 pr-3">
                                        {plan.label}
                                    </td>
                                    <td
                                        className={cn(
                                            'py-1.5 pr-3 font-mono',
                                            ptddColor(ptdd),
                                        )}
                                    >
                                        {ptdd.toFixed(2)}×
                                    </td>
                                    <td className="py-1.5 pr-3">
                                        {formatPercent(out.passProbability)}
                                    </td>
                                    <td className="py-1.5 pr-3">
                                        {formatDays(out.daysToPassP50)}
                                    </td>
                                    <td className="py-1.5 pr-3">
                                        {formatCurrency(out.expectedGrossSpend)}
                                    </td>
                                    <td className="py-1.5 pr-3">
                                        {formatCurrency(out.expectedMonthlyNet)}
                                    </td>
                                    <td className="py-1.5 pr-3">
                                        {formatPercent(out.roiOnCost)}
                                    </td>
                                    <td className="py-1.5 pr-3 text-amber-400">
                                        {'★'.repeat(score)}
                                        <span className="text-muted-foreground">
                                            {'★'.repeat(5 - score)}
                                        </span>
                                        {isBest && !isActive && (
                                            <span className="ml-1 text-emerald-400">
                                                ★
                                            </span>
                                        )}
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

function ptddColor(ratio: number): string {
    if (ratio <= 1) return 'text-emerald-400';
    if (ratio <= 1.5) return '';
    if (ratio <= 2) return 'text-amber-400';
    return 'text-rose-400';
}

function useDebouncedKey(
    inputs: Omit<SimInputs, 'plan'>,
    firmId: string,
    delay: number,
): string {
    const key = JSON.stringify({
        act: inputs.discounts?.activationPercent ?? 0,
        attempts: inputs.maxAttempts ?? 1,
        commission: inputs.commissionPerRoundTrip ?? 0,
        copy: inputs.copyAccounts ?? 1,
        eval: inputs.discounts?.evalPercent ?? 0,
        firmId,
        funded: inputs.fundedHorizonDays,
        max: inputs.maxEvalDays,
        risk: inputs.riskPerTrade,
        rr: inputs.rrRatio,
        seed: inputs.seed,
        tpd: inputs.tradesPerDay,
        trials: inputs.trials,
        winrate: inputs.winrate,
    });
    const [debounced, setDebounced] = useState(key);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(key), delay);
        return () => clearTimeout(t);
    }, [key, delay]);
    return debounced;
}
