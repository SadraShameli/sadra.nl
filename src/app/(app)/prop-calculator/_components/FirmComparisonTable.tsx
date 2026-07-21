'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { Building2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Card } from '~/components/ui/Card';
import { DataTable } from '~/components/ui/DataTable';
import { EmptyState } from '~/components/ui/EmptyState';
import InfoPopover from '~/components/ui/InfoPopover';
import { formatCurrency, formatDays, formatPercent } from '~/lib/format';
import {
    type FirmId,
    type Plan,
    type SimInputs,
    type SimOutputs,
    simulate,
    type TradingFirm,
} from '~/lib/prop-calculator';
import { cn } from '~/lib/utilities';

import { panelDescriptions } from './kpiDescriptions';

interface FirmComparisonTableProperties {
    activeFirmId: FirmId;
    baseInputs: Omit<SimInputs, 'plan'>;
    firms: readonly TradingFirm[];
    targetAccountSize: number;
}

interface Row {
    firm: TradingFirm;
    out: SimOutputs;
    plan: Plan;
    score: number;
}

export default function FirmComparisonTable({
    activeFirmId,
    baseInputs,
    firms,
    targetAccountSize,
}: FirmComparisonTableProperties) {
    const [rows, setRows] = useState<Row[]>([]);
    const [pending, setPending] = useState(false);
    const inputsReference = useRef(baseInputs);
    inputsReference.current = baseInputs;
    const firmsReference = useRef(firms);
    firmsReference.current = firms;
    const targetSizeReference = useRef(targetAccountSize);
    targetSizeReference.current = targetAccountSize;

    const debouncedKey = useDebouncedKey(baseInputs, targetAccountSize, 700);

    useEffect(() => {
        let isCancelled = false;
        setPending(true);
        const handle = setTimeout(() => {
            const inputs = inputsReference.current;
            const firmList = firmsReference.current;
            const targetSize = targetSizeReference.current;
            const trials = Math.min(500, inputs.trials);
            const partial: Omit<Row, 'score'>[] = [];
            for (const firm of firmList) {
                const plan = pickPlan(firm, targetSize);
                if (!plan) continue;
                const sim = simulate({ ...inputs, plan, trials });
                partial.push({ firm, out: sim, plan });
            }
            partial.sort(
                (a, b) => b.out.expectedMonthlyNet - a.out.expectedMonthlyNet,
            );
            const bestNet =
                partial.length === 0
                    ? -Infinity
                    : Math.max(...partial.map((r) => r.out.expectedMonthlyNet));
            const withScore: Row[] = partial.map((r) => ({
                ...r,
                score:
                    bestNet > 0
                        ? Math.max(
                              1,
                              Math.round(
                                  (r.out.expectedMonthlyNet / bestNet) * 5,
                              ),
                          )
                        : 1,
            }));
            if (!isCancelled) {
                setRows(withScore);
                setPending(false);
            }
        }, 0);
        return () => {
            isCancelled = true;
            clearTimeout(handle);
        };
    }, [debouncedKey]);

    const columns = useMemo<ColumnDef<Row>[]>(
        () => [
            {
                accessorFn: (r) => r.firm.displayName,
                cell: ({ row }) => row.original.firm.displayName,
                header: 'Firm',
                id: 'firm',
            },
            {
                accessorFn: (r) => r.plan.label,
                cell: ({ row }) => (
                    <span className="text-muted-foreground">
                        {row.original.plan.label}
                    </span>
                ),
                header: 'Plan',
                id: 'plan',
            },
            {
                accessorFn: (r) => r.out.passProbability,
                cell: ({ row }) =>
                    formatPercent(row.original.out.passProbability),
                header: 'Pass%',
                id: 'pass',
            },
            {
                accessorFn: (r) => r.out.daysToPassP50,
                cell: ({ row }) => formatDays(row.original.out.daysToPassP50),
                header: 'Days',
                id: 'days',
            },
            {
                accessorFn: (r) => r.out.expectedTotalCost,
                cell: ({ row }) =>
                    formatCurrency(row.original.out.expectedTotalCost),
                header: 'Cost',
                id: 'cost',
            },
            {
                accessorFn: (r) => r.out.expectedMonthlyNet,
                cell: ({ row }) =>
                    formatCurrency(row.original.out.expectedMonthlyNet),
                header: 'Monthly net',
                id: 'monthlyNet',
            },
            {
                accessorFn: (r) => r.out.roiOnCost,
                cell: ({ row }) => formatPercent(row.original.out.roiOnCost),
                header: 'ROI',
                id: 'roi',
            },
            {
                accessorFn: (r) => r.score,
                cell: ({ row }) => (
                    <span className="text-amber-400">
                        {'★'.repeat(row.original.score)}
                        <span className="text-muted-foreground">
                            {'★'.repeat(5 - row.original.score)}
                        </span>
                    </span>
                ),
                header: 'Score',
                id: 'score',
            },
        ],
        [],
    );

    return (
        <Card
            className={cn('app-prop-calculator__firm-comparison', 'px-5 py-4')}
        >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
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
            <DataTable<Row, unknown>
                className="app-prop-calculator__firm-comparison-table text-xs tabular-nums"
                columns={columns}
                data={rows}
                emptyState={
                    <EmptyState
                        icon={Building2}
                        title={pending ? 'Computing…' : 'No matching plans'}
                    />
                }
                pageSize={null}
                rowClassName={(r) =>
                    r.firm.id === activeFirmId
                        ? 'bg-primary/10 font-semibold text-foreground'
                        : undefined
                }
                rowId={(r) => r.firm.id}
            />
        </Card>
    );
}

function pickPlan(firm: TradingFirm, targetSize: number): null | Plan {
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
