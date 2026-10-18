'use client';

import { ShieldAlert } from 'lucide-react';
import { useMemo } from 'react';

import { MissingValue } from '~/components/MissingValue';
import { ChartSkeleton } from '~/components/ui/chart';
import { DataTable, type DataTableColumn } from '~/components/ui/data-table';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';
import { Skeleton } from '~/components/ui/skeleton';
import { WarningNote } from '~/components/WarningNote';
import { formatCurrency, formatPercent } from '~/lib/format';
import {
    type SimInputs,
    type SimOutputs,
    simulate,
} from '~/lib/prop-calculator';
import { simInputsSizingIssue } from '~/lib/prop-calculator/simulator';

import RuleStressBarChartView from './charts/RuleStressBarChartView';
import { ComputationId } from './ComputationId';
import { buildStressScenarios } from './ruleStressScenarios';
import { formatSignedPercent } from './signedPercent';
import { simInputsCacheKey } from './simInputsCacheKey';
import { SimulationFailureNotice } from './SimulationFailureNotice';
import { useSectionComputing } from './ToolSection';
import { useDebouncedComputation } from './useDebouncedSimulation';

export interface ScenarioRow {
    isNoOp: boolean;
    label: string;
    out: SimOutputs;
}

interface RuleStressTestPanelProperties {
    baseInputs: SimInputs;
}

const MAX_TRIALS = 500;
const ZERO_BASELINE_REASON =
    'The baseline monthly net is $0, so a percent change has no base.';
const DEBOUNCE_MS = 500;

export default function RuleStressTestPanel({
    baseInputs,
}: RuleStressTestPanelProperties) {
    const key = buildCacheKey(baseInputs);
    const {
        error,
        pending,
        result: rows,
    } = useDebouncedComputation(
        ComputationId.RuleStress,
        key,
        DEBOUNCE_MS,
        () => {
            const trials = Math.min(MAX_TRIALS, baseInputs.trials);
            const scenarios = buildStressScenarios(baseInputs.plan);
            return scenarios.map(({ isNoOp, label, plan }) => ({
                isNoOp,
                label,
                out: simulate({ ...baseInputs, plan, trials }),
            }));
        },
        [],
        simInputsSizingIssue(baseInputs),
    );

    useSectionComputing(pending);
    const baseline = rows[0] ?? null;

    const chartRows = useMemo(
        () =>
            rows.map((r) => ({
                label: r.label,
                monthlyNet: r.out.expectedMonthlyNet,
            })),
        [rows],
    );

    const columns = useMemo<DataTableColumn<ScenarioRow>[]>(
        () => [
            {
                accessorFn: (r) => r.label,
                cell: ({ row }) => (
                    <div className="flex flex-col">
                        <span className="font-medium text-foreground">
                            {row.original.label}
                        </span>
                        {row.original.isNoOp && (
                            <WarningNote className="text-xs">
                                no DLL on this plan, so no effect
                            </WarningNote>
                        )}
                    </div>
                ),
                header: 'Scenario',
                id: 'scenario',
                meta: { isRowHeader: true },
            },
            {
                accessorFn: (r) => r.out.expectedMonthlyNet,
                cell: ({ row }) =>
                    formatCurrency(row.original.out.expectedMonthlyNet),
                header: 'Monthly net',
                id: 'monthlyNet',
            },
            {
                accessorFn: (r) =>
                    r.out.expectedMonthlyNet -
                    (baseline?.out.expectedMonthlyNet ?? 0),
                cell: ({ row }) => {
                    if (!baseline) return <MissingValue />;
                    const delta =
                        row.original.out.expectedMonthlyNet -
                        baseline.out.expectedMonthlyNet;
                    return formatSignedCurrency(delta);
                },
                header: 'Δ$ vs baseline',
                id: 'deltaDollars',
            },
            {
                accessorFn: (r) => pctDelta(r.out.expectedMonthlyNet, baseline),
                cell: ({ row }) => {
                    if (!baseline || baseline.out.expectedMonthlyNet === 0) {
                        return <MissingValue reason={ZERO_BASELINE_REASON} />;
                    }
                    const pct = pctDelta(
                        row.original.out.expectedMonthlyNet,
                        baseline,
                    );
                    return formatSignedPercent(pct);
                },
                header: 'Δ% vs baseline',
                id: 'deltaPercent',
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
                accessorFn: (r) => r.out.bustProbability,
                cell: ({ row }) =>
                    formatPercent(row.original.out.bustProbability),
                header: 'Bust%',
                id: 'bust',
            },
        ],
        [baseline],
    );

    return (
        <div className="app-prop-calculator__rule-stress-test flex flex-col gap-4">
            {rows.length === 0 ? (
                error === null ? (
                    pending ? (
                        <div className="flex flex-col gap-4">
                            <ChartSkeleton />
                            <Skeleton className="h-40 w-full rounded-md" />
                        </div>
                    ) : (
                        <EmptyState
                            description="Adjust your inputs to see how your edge holds up against tighter rules."
                            icon={ShieldAlert}
                            size={EmptyStateSize.Compact}
                            title="No data yet"
                        />
                    )
                ) : (
                    <SimulationFailureNotice message={error} />
                )
            ) : (
                <div className="flex flex-col gap-4">
                    <RuleStressBarChartView rows={chartRows} />
                    <DataTable<ScenarioRow>
                        className="app-prop-calculator__rule-stress-table text-xs tabular-nums"
                        columns={columns}
                        data={rows}
                        pageSize={null}
                        rowId={(r) => r.label}
                    />
                </div>
            )}
        </div>
    );
}

function buildCacheKey(inputs: Omit<SimInputs, 'riskPerTrade'>): string {
    return simInputsCacheKey(inputs);
}

function formatSignedCurrency(n: number): string {
    const sign = n > 0 ? '+' : '';
    return `${sign}${formatCurrency(n)}`;
}

function pctDelta(value: number, baseline: null | ScenarioRow): number {
    return !baseline || baseline.out.expectedMonthlyNet === 0
        ? 0
        : (value - baseline.out.expectedMonthlyNet) /
              Math.abs(baseline.out.expectedMonthlyNet);
}
