'use client';

import { Building2 } from 'lucide-react';
import { useMemo } from 'react';

import { Card } from '~/components/ui/Card';
import { DataTable, type DataTableColumn } from '~/components/ui/DataTable';
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
import { bestExpectedMonthlyNet, scoreByExpectedMonthlyNet } from './scoring';
import { useDebouncedComputation } from './useDebouncedSimulation';

const DEBOUNCE_MS = 700;
const MAX_TRIALS = 500;

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
    const key = buildCacheKey(baseInputs, targetAccountSize);
    const { pending, result: rows } = useDebouncedComputation<Row[]>(
        key,
        DEBOUNCE_MS,
        () => {
            const trials = Math.min(MAX_TRIALS, baseInputs.trials);
            const partial: Omit<Row, 'score'>[] = [];
            for (const firm of firms) {
                const plan = pickPlan(firm, targetAccountSize);
                if (!plan) continue;
                const sim = simulate({ ...baseInputs, plan, trials });
                partial.push({ firm, out: sim, plan });
            }
            const bestNet = bestExpectedMonthlyNet(partial);
            return partial.map((r) => ({
                ...r,
                score: scoreByExpectedMonthlyNet(
                    r.out.expectedMonthlyNet,
                    bestNet,
                ),
            }));
        },
        [],
    );

    const columns = useMemo<DataTableColumn<Row>[]>(
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
                accessorFn: (r) => r.out.roiOnCost.value,
                cell: ({ row }) =>
                    formatPercent(row.original.out.roiOnCost.value),
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
            <DataTable<Row>
                className="app-prop-calculator__firm-comparison-table text-xs tabular-nums"
                columns={columns}
                data={rows}
                emptyState={
                    <EmptyState
                        icon={Building2}
                        title={pending ? 'Computing…' : 'No matching plans'}
                    />
                }
                initialSorting={[{ desc: true, id: 'monthlyNet' }]}
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

function buildCacheKey(
    inputs: Omit<SimInputs, 'plan'>,
    accountSize: number,
): string {
    return JSON.stringify({
        accountSize,
        act: inputs.discounts?.activationPercent ?? 0,
        attempts: inputs.maxAttempts ?? 1,
        commission: inputs.commissionPerRoundTrip ?? 0,
        copy: inputs.copyAccounts ?? 1,
        dayStop: inputs.dayStop ?? null,
        eval: inputs.discounts?.evalPercent ?? 0,
        evalDayPolicy: inputs.evalDayPolicy ?? null,
        funded: inputs.fundedHorizonDays,
        max: inputs.maxEvalDays,
        risk: inputs.riskPerTrade,
        rr: inputs.rrRatio,
        seed: inputs.seed,
        tpd: inputs.tradesPerDay,
        trials: inputs.trials,
        winrate: inputs.winrate,
    });
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
