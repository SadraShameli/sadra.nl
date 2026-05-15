'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Card } from '~/components/ui/Card';
import { DataTable } from '~/components/ui/DataTable';
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
    isBest: boolean;
    out: SimOutputs;
    plan: Plan;
    ptdd: number;
    score: number;
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
            const partial = plans.map((plan) => ({
                out: simulate({ ...inputs, plan, trials }),
                plan,
                ptdd: plan.profitTarget / plan.drawdown.amount,
            }));
            const bestNet =
                partial.length === 0
                    ? Number.NEGATIVE_INFINITY
                    : Math.max(...partial.map((r) => r.out.expectedMonthlyNet));
            const withScore: Row[] = partial.map((r) => ({
                ...r,
                isBest:
                    r.out.expectedMonthlyNet === bestNet &&
                    bestNet > Number.NEGATIVE_INFINITY,
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
            if (!cancelled) {
                setRows(withScore);
                setPending(false);
            }
        }, 0);
        return () => {
            cancelled = true;
            clearTimeout(handle);
        };
    }, [debouncedKey]);

    const columns = useMemo<ColumnDef<Row>[]>(
        () => [
            {
                accessorFn: (r) => r.plan.label,
                cell: ({ row }) => row.original.plan.label,
                header: 'Plan',
                id: 'plan',
            },
            {
                accessorFn: (r) => r.ptdd,
                cell: ({ row }) => (
                    <span
                        className={cn(
                            'font-mono',
                            ptddColor(row.original.ptdd),
                        )}
                    >
                        {row.original.ptdd.toFixed(2)}×
                    </span>
                ),
                header: 'PT:DD',
                id: 'ptdd',
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
                accessorFn: (r) => r.out.expectedGrossSpend,
                cell: ({ row }) =>
                    formatCurrency(row.original.out.expectedGrossSpend),
                header: 'Exp. spend',
                id: 'spend',
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
                cell: ({ row }) => {
                    const isActive = row.original.plan === activePlan;
                    return (
                        <span className="text-amber-400">
                            {'★'.repeat(row.original.score)}
                            <span className="text-muted-foreground">
                                {'★'.repeat(5 - row.original.score)}
                            </span>
                            {row.original.isBest && !isActive && (
                                <span className="ml-1 text-emerald-400">★</span>
                            )}
                        </span>
                    );
                },
                header: 'Score',
                id: 'score',
            },
        ],
        [activePlan],
    );

    return (
        <Card
            className={cn('app-prop-calculator__plan-comparison', 'px-5 py-4')}
        >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
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
            <DataTable<Row, unknown>
                className="app-prop-calculator__plan-comparison-table text-xs tabular-nums"
                columns={columns}
                data={rows}
                emptyMessage={pending ? 'computing…' : 'No plans.'}
                pageSize={null}
                rowClassName={(r) =>
                    r.plan === activePlan
                        ? 'bg-primary/10 font-semibold text-foreground'
                        : undefined
                }
                rowId={(r) => JSON.stringify(r.plan.id)}
                tableClassName="min-w-max whitespace-nowrap"
            />
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
