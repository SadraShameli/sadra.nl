'use client';

import { Layers } from 'lucide-react';
import { useMemo } from 'react';

import { Card } from '~/components/ui/Card';
import { DataTable, type DataTableColumn } from '~/components/ui/DataTable';
import { EmptyState } from '~/components/ui/EmptyState';
import InfoPopover from '~/components/ui/InfoPopover';
import {
    formatCurrency,
    formatDays,
    formatOptionalPercent,
    formatPercent,
} from '~/lib/format';
import {
    type Plan,
    rankablePlans,
    type SimInputs,
    type SimOutputs,
    simulate,
    type TradingFirm,
    withOneTimeEarlyWithdrawalTaken,
} from '~/lib/prop-calculator';
import { cn } from '~/lib/utilities';

import { panelDescriptions } from './kpiDescriptions';
import { ptddColor } from './metricColors';
import { bestExpectedMonthlyNet, scoreByExpectedMonthlyNet } from './scoring';
import { simInputsCacheKey, SimInputsKeyField } from './simInputsCacheKey';
import { useDebouncedComputation } from './useDebouncedSimulation';

const DEBOUNCE_MS = 600;
const MAX_TRIALS = 500;

interface PlanComparisonTableProperties {
    activePlan: Plan;
    baseInputs: Omit<SimInputs, 'plan'>;
    firm: TradingFirm;
    takesOneTimeEarlyWithdrawal: boolean;
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
    takesOneTimeEarlyWithdrawal,
}: PlanComparisonTableProperties) {
    const key = buildCacheKey(baseInputs, firm.id, takesOneTimeEarlyWithdrawal);
    const { pending, result: rows } = useDebouncedComputation<Row[]>(
        key,
        DEBOUNCE_MS,
        () => {
            const trials = Math.min(MAX_TRIALS, baseInputs.trials);
            const partial = rankablePlans(firm.plans, false).map((plan) => ({
                out: simulate({
                    ...baseInputs,
                    plan: withOneTimeEarlyWithdrawalTaken(
                        plan,
                        takesOneTimeEarlyWithdrawal,
                    ),
                    trials,
                }),
                plan,
                ptdd: plan.profitTarget / plan.drawdown.amount,
            }));
            const bestNet = bestExpectedMonthlyNet(partial);
            return partial.map((r) => ({
                ...r,
                isBest:
                    r.out.expectedMonthlyNet === bestNet && bestNet > -Infinity,
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
                accessorFn: (r) => r.out.evalPassProbability,
                cell: ({ row }) =>
                    formatPercent(row.original.out.evalPassProbability),
                header: 'Eval pass',
                id: 'evalPass',
            },
            {
                accessorFn: (r) => r.out.fundedSurvivalProbability,
                cell: ({ row }) =>
                    formatPercent(row.original.out.fundedSurvivalProbability),
                header: 'Funded survive',
                id: 'fundedSurvive',
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
                accessorFn: (r) => r.out.roiOnCost.value ?? undefined,
                cell: ({ row }) =>
                    formatOptionalPercent(row.original.out.roiOnCost.value),
                header: 'ROI',
                id: 'roi',
                sortUndefined: 'last',
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
            <DataTable<Row>
                className="app-prop-calculator__plan-comparison-table text-xs tabular-nums"
                columns={columns}
                data={rows}
                emptyState={
                    <EmptyState
                        icon={Layers}
                        title={pending ? 'Computing…' : 'No plans'}
                    />
                }
                pageSize={null}
                rowClassName={(r) =>
                    r.plan === activePlan
                        ? 'bg-primary/10 font-semibold text-foreground'
                        : undefined
                }
                rowId={(r) => JSON.stringify(r.plan.id)}
            />
        </Card>
    );
}

function buildCacheKey(
    inputs: Omit<SimInputs, 'plan'>,
    firmId: string,
    isEarlyWithdrawalTaken: boolean,
): string {
    return simInputsCacheKey(inputs, {
        extra: { earlyWithdrawal: isEarlyWithdrawalTaken, firmId },
        omit: [SimInputsKeyField.PlanId],
    });
}
