'use client';

import { Target } from 'lucide-react';
import { useMemo, useRef } from 'react';

import { Card } from '~/components/ui/Card';
import { DataTable, type DataTableColumn } from '~/components/ui/DataTable';
import { EmptyState } from '~/components/ui/EmptyState';
import InfoPopover from '~/components/ui/InfoPopover';
import {
    formatCurrency,
    formatDays,
    formatOptionalPercent,
    formatPercent,
    formatStreak,
} from '~/lib/format';
import {
    type Plan,
    type SimInputs,
    type SimOutputs,
    simulate,
} from '~/lib/prop-calculator';
import { cn } from '~/lib/utilities';

import {
    AppliedEvalLadderNotice,
    EvalLadderScope,
} from './AppliedEvalLadderNotice';
import { ComputationId } from './ComputationId';
import { panelDescriptions } from './kpiDescriptions';
import { riskPercentToDollars } from './riskConversion';
import { bestExpectedMonthlyNet } from './scoring';
import { simInputsCacheKey, SimInputsKeyField } from './simInputsCacheKey';
import { partitionBySizing } from './simulationFailure';
import { SimulationFailureNotice } from './SimulationFailureNotice';
import { useDebouncedComputation } from './useDebouncedSimulation';

const RISK_LEVELS = [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5] as const;
const DEBOUNCE_MS = 500;
const MAX_TRIALS = 500;

export interface Row {
    accountSize: number;
    isBest: boolean;
    out: SimOutputs;
    riskPct: number;
}

interface OptimalRiskTableProperties {
    baseInputs: Omit<SimInputs, 'riskPerTrade'>;
    currentRiskPercent: number;
    plan: Plan;
}

export default function OptimalRiskTable({
    baseInputs,
    currentRiskPercent,
    plan,
}: OptimalRiskTableProperties) {
    const key = buildCacheKey(baseInputs);
    const accountSize = plan.accountSize;
    const levels = partitionBySizing(RISK_LEVELS, (riskPct) => ({
        ...baseInputs,
        riskPerTrade: riskPercentToDollars(riskPct, accountSize),
    }));
    const {
        error,
        pending,
        result: rows,
    } = useDebouncedComputation(
        ComputationId.OptimalRisk,
        key,
        DEBOUNCE_MS,
        () => {
            const trials = Math.min(MAX_TRIALS, baseInputs.trials);
            const partial = levels.accepted.map((riskPct) => {
                const riskDollars = riskPercentToDollars(riskPct, accountSize);
                const out = simulate({
                    ...baseInputs,
                    evalDayPolicy: undefined,
                    riskPerTrade: riskDollars,
                    trials,
                });
                return { accountSize, out, riskPct };
            });
            const bestNet = bestExpectedMonthlyNet(partial);
            return partial.map((r) => ({
                ...r,
                isBest: r.out.expectedMonthlyNet === bestNet,
            }));
        },
        [],
    );

    const cardReference = useRef<HTMLDivElement>(null);

    const bestRow = useMemo(() => rows.find((r) => r.isBest) ?? null, [rows]);

    const closestRiskPct = nearestRisk(currentRiskPercent);

    const columns = useMemo<DataTableColumn<Row>[]>(
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
                accessorFn: (r) => r.out.roiOnCost.value ?? undefined,
                cell: ({ row }) =>
                    formatOptionalPercent(row.original.out.roiOnCost.value),
                header: 'ROI',
                id: 'roi',
                sortUndefined: 'last',
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
        <Card
            className={cn(
                'app-prop-calculator__optimal-risk',
                'px-5 py-4 outline-none',
            )}
            ref={cardReference}
            tabIndex={-1}
        >
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
            <AppliedEvalLadderNotice
                onCleared={() => cardReference.current?.focus()}
                scope={EvalLadderScope.NotUsedHere}
            />
            <SimulationFailureNotice
                message={describeRefusedLevels(
                    levels.refused.map((refusal) => refusal.item),
                )}
            />
            <SimulationFailureNotice message={error} />
            <DataTable<Row>
                className="app-prop-calculator__optimal-risk-table text-xs tabular-nums"
                columns={columns}
                data={rows}
                emptyState={
                    <EmptyState
                        description="Adjust your inputs to see the optimal risk distribution."
                        icon={Target}
                        title="No data yet"
                    />
                }
                pageSize={null}
                rowClassName={(r) =>
                    r.riskPct === closestRiskPct
                        ? 'bg-primary/10 font-semibold text-foreground'
                        : undefined
                }
                rowId={(r) => String(r.riskPct)}
            />
        </Card>
    );
}

function buildCacheKey(inputs: Omit<SimInputs, 'riskPerTrade'>): string {
    return simInputsCacheKey(inputs, {
        omit: [SimInputsKeyField.EvalDayPolicy, SimInputsKeyField.RiskPerTrade],
    });
}

function describeRefusedLevels(riskPercents: readonly number[]): null | string {
    if (riskPercents.length === 0) return null;
    const levels = riskPercents.map((riskPct) => `${riskPct}%`).join(', ');
    return `Not simulated: ${levels} (below one contract at the stop, so funded flat risk would never trade).`;
}

function nearestRisk(target: number): number {
    return RISK_LEVELS.reduce((best, v) =>
        Math.abs(v - target) < Math.abs(best - target) ? v : best,
    );
}
