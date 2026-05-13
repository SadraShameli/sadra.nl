'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { Card } from '~/components/ui/Card';
import {
    type FirmId,
    type Plan,
    type PropFirm,
    type SimInputs,
    type SimOutputs,
    simulate,
} from '~/lib/prop-calculator';
import { cn } from '~/lib/utils';

import { formatCurrency, formatDays, formatPercent } from './helpers';
import InfoPopover from './InfoPopover';
import { panelDescriptions } from './kpiDescriptions';

interface FirmComparisonTableProps {
    activeFirmId: FirmId;
    baseInputs: Omit<SimInputs, 'plan'>;
    firms: readonly PropFirm[];
    targetAccountSize: number;
}

interface Row {
    firm: PropFirm;
    out: SimOutputs;
    plan: Plan;
}

export default function FirmComparisonTable({
    activeFirmId,
    baseInputs,
    firms,
    targetAccountSize,
}: FirmComparisonTableProps) {
    const [rows, setRows] = useState<Row[]>([]);
    const [pending, setPending] = useState(false);
    const inputsRef = useRef(baseInputs);
    inputsRef.current = baseInputs;
    const firmsRef = useRef(firms);
    firmsRef.current = firms;
    const targetSizeRef = useRef(targetAccountSize);
    targetSizeRef.current = targetAccountSize;

    const debouncedKey = useDebouncedKey(baseInputs, targetAccountSize, 700);

    useEffect(() => {
        let cancelled = false;
        setPending(true);
        const handle = setTimeout(() => {
            const inputs = inputsRef.current;
            const firmList = firmsRef.current;
            const targetSize = targetSizeRef.current;
            const trials = Math.min(500, inputs.trials);
            const out: Row[] = [];
            for (const firm of firmList) {
                const plan = pickPlan(firm, targetSize);
                if (!plan) continue;
                const sim = simulate({ ...inputs, plan, trials });
                out.push({ firm, out: sim, plan });
            }
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

    const sorted = useMemo(
        () =>
            rows.toSorted(
                (a, b) => b.out.expectedMonthlyNet - a.out.expectedMonthlyNet,
            ),
        [rows],
    );

    return (
        <Card className="px-5 py-4">
            <div className="mb-3 flex items-baseline justify-between gap-2">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">
                        Firm comparison at your inputs
                    </h3>
                    <InfoPopover title="Firm comparison">
                        {panelDescriptions.firmComparison}
                    </InfoPopover>
                </div>
                <span className="text-xs text-muted-foreground">
                    {pending
                        ? 'computing…'
                        : `closest plan to $${(targetAccountSize / 1000).toFixed(0)}K`}
                </span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full min-w-max text-xs whitespace-nowrap tabular-nums">
                    <thead className="text-muted-foreground">
                        <tr className="text-left">
                            <th className="py-1 pr-2 font-medium">Firm</th>
                            <th className="py-1 pr-2 font-medium">Plan</th>
                            <th className="py-1 pr-2 font-medium">Pass%</th>
                            <th className="py-1 pr-2 font-medium">Days</th>
                            <th className="py-1 pr-2 font-medium">Cost</th>
                            <th className="py-1 pr-2 font-medium">
                                Monthly net
                            </th>
                            <th className="py-1 pr-2 font-medium">ROI</th>
                            <th className="py-1 pr-2 font-medium">Score</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map(({ firm, out, plan }) => {
                            const isActive = firm.id === activeFirmId;
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
                            return (
                                <tr
                                    className={cn(
                                        'border-t border-border/40 transition-colors',
                                        isActive &&
                                            'bg-primary/10 font-semibold text-foreground',
                                    )}
                                    key={firm.id}
                                >
                                    <td className="py-1.5 pr-2">
                                        {firm.displayName}
                                    </td>
                                    <td className="py-1.5 pr-2 text-muted-foreground">
                                        {plan.label}
                                    </td>
                                    <td className="py-1.5 pr-2">
                                        {formatPercent(out.passProbability)}
                                    </td>
                                    <td className="py-1.5 pr-2">
                                        {formatDays(out.daysToPassP50)}
                                    </td>
                                    <td className="py-1.5 pr-2">
                                        {formatCurrency(out.expectedTotalCost)}
                                    </td>
                                    <td className="py-1.5 pr-2">
                                        {formatCurrency(out.expectedMonthlyNet)}
                                    </td>
                                    <td className="py-1.5 pr-2">
                                        {formatPercent(out.roiOnCost)}
                                    </td>
                                    <td className="py-1.5 pr-2 text-amber-400">
                                        {'★'.repeat(score)}
                                        <span className="text-muted-foreground">
                                            {'★'.repeat(5 - score)}
                                        </span>
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

function pickPlan(firm: PropFirm, targetSize: number): null | Plan {
    const sameSize = firm.plans.filter((p) => p.accountSize === targetSize);
    if (sameSize.length > 0) {
        return sameSize.reduce<null | Plan>((best, p) => {
            if (!best) return p;
            return p.profitTarget < best.profitTarget ? p : best;
        }, null);
    }
    let closest: null | Plan = null;
    let closestDiff = Infinity;
    for (const p of firm.plans) {
        const diff = Math.abs(p.accountSize - targetSize);
        if (diff < closestDiff) {
            closest = p;
            closestDiff = diff;
        }
    }
    return closest;
}

function useDebouncedKey(
    inputs: Omit<SimInputs, 'plan'>,
    accountSize: number,
    delay: number,
): string {
    const key = JSON.stringify({
        accountSize,
        act: inputs.discounts?.activationPercent ?? 0,
        attempts: inputs.maxAttempts ?? 1,
        commission: inputs.commissionPerRoundTrip ?? 0,
        copy: inputs.copyAccounts ?? 1,
        eval: inputs.discounts?.evalPercent ?? 0,
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
