'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Card } from '~/components/ui/Card';
import { DataTable } from '~/components/ui/DataTable';
import InfoPopover from '~/components/ui/InfoPopover';
import {
    formatCurrency,
    formatDays,
    formatPercent,
    formatStreak,
} from '~/lib/format';
import {
    type Plan,
    type SimInputs,
    type SimOutputs,
    simulate,
} from '~/lib/prop-calculator';
import { cn } from '~/lib/utils';

import { panelDescriptions } from './kpiDescriptions';

const RISK_LEVELS = [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5] as const;

interface OptimalRiskTableProps {
    baseInputs: Omit<SimInputs, 'riskPerTrade'>;
    currentRiskPercent: number;
    plan: Plan;
}

interface Row {
    accountSize: number;
    isBest: boolean;
    out: SimOutputs;
    riskPct: number;
}

export default function OptimalRiskTable({
    baseInputs,
    currentRiskPercent,
    plan,
}: OptimalRiskTableProps) {
    const [rows, setRows] = useState<Row[]>([]);
    const [pending, setPending] = useState(false);
    const inputsRef = useRef(baseInputs);
    inputsRef.current = baseInputs;
    const planRef = useRef(plan);
    planRef.current = plan;

    const debouncedKey = useDebouncedKey(baseInputs);

    useEffect(() => {
        let cancelled = false;
        setPending(true);
        const handle = setTimeout(() => {
            const inputs = inputsRef.current;
            const accountSize = planRef.current.accountSize;
            const trials = Math.min(500, inputs.trials);
            const partial = RISK_LEVELS.map((riskPct) => {
                const riskDollars = (accountSize * riskPct) / 100;
                const out = simulate({
                    ...inputs,
                    riskPerTrade: riskDollars,
                    trials,
                });
                return { accountSize, out, riskPct };
            });
            const bestNet = partial.reduce(
                (best, r) => Math.max(r.out.expectedMonthlyNet, best),
                Number.NEGATIVE_INFINITY,
            );
            const results: Row[] = partial.map((r) => ({
                ...r,
                isBest: r.out.expectedMonthlyNet === bestNet,
            }));
            if (!cancelled) {
                setRows(results);
                setPending(false);
            }
        }, 0);
        return () => {
            cancelled = true;
            clearTimeout(handle);
        };
    }, [debouncedKey]);

    const bestRow = useMemo(() => rows.find((r) => r.isBest) ?? null, [rows]);

    const closestRiskPct = nearestRisk(currentRiskPercent);

    const columns = useMemo<ColumnDef<Row>[]>(
        () => [
            {
                accessorFn: (r) => r.riskPct,
                cell: ({ row }) => (
                    <>
                        {formatCurrency(
                            (row.original.accountSize * row.original.riskPct) /
                                100,
                        )}
                        <span className="ml-1 text-muted-foreground">
                            ({row.original.riskPct}%)
                        </span>
                        {row.original.isBest &&
                            row.original.riskPct !== closestRiskPct && (
                                <span className="ml-1 text-emerald-400">★</span>
                            )}
                    </>
                ),
                header: 'Risk',
                id: 'risk',
            },
            {
                accessorFn: (r) => r.out.passProbability,
                cell: ({ row }) =>
                    formatPercent(row.original.out.passProbability),
                header: 'Pass%',
                id: 'pass',
            },
            {
                accessorFn: (r) => r.out.bustProbability,
                cell: ({ row }) =>
                    formatPercent(row.original.out.bustProbability),
                header: 'Bust%',
                id: 'bust',
            },
            {
                accessorFn: (r) => r.out.daysToPassP50,
                cell: ({ row }) => formatDays(row.original.out.daysToPassP50),
                header: 'Days P50',
                id: 'days',
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
                accessorFn: (r) => r.out.maxLosingStreakP95,
                cell: ({ row }) =>
                    formatStreak(row.original.out.maxLosingStreakP95),
                header: 'Streak P95',
                id: 'streak',
            },
        ],
        [closestRiskPct],
    );

    return (
        <Card className={cn('app-prop-calculator__optimal-risk', 'px-5 py-4')}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
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
            <DataTable<Row, unknown>
                className="app-prop-calculator__optimal-risk-table text-xs tabular-nums"
                columns={columns}
                data={rows}
                emptyMessage="No data yet."
                pageSize={null}
                rowClassName={(r) =>
                    r.riskPct === closestRiskPct
                        ? 'bg-primary/10 font-semibold text-foreground'
                        : undefined
                }
                rowId={(r) => String(r.riskPct)}
                tableClassName="min-w-max whitespace-nowrap"
            />
        </Card>
    );
}

function nearestRisk(target: number): number {
    return RISK_LEVELS.reduce((best, v) =>
        Math.abs(v - target) < Math.abs(best - target) ? v : best,
    );
}

function useDebouncedKey(inputs: Omit<SimInputs, 'riskPerTrade'>): string {
    const key = JSON.stringify({
        act: inputs.discounts?.activationPercent ?? 0,
        attempts: inputs.maxAttempts ?? 1,
        commission: inputs.commissionPerRoundTrip ?? 0,
        copy: inputs.copyAccounts ?? 1,
        eval: inputs.discounts?.evalPercent ?? 0,
        firmId: inputs.plan.id,
        funded: inputs.fundedHorizonDays,
        max: inputs.maxEvalDays,
        rr: inputs.rrRatio,
        seed: inputs.seed,
        tpd: inputs.tradesPerDay,
        trials: inputs.trials,
        winrate: inputs.winrate,
    });
    const [debounced, setDebounced] = useState(key);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(key), 500);
        return () => clearTimeout(t);
    }, [key]);
    return debounced;
}
