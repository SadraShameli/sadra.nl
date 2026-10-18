'use client';

import { Layers } from 'lucide-react';
import { useMemo } from 'react';

import { InfoNote } from '~/components/InfoNote';
import { Badge } from '~/components/ui/badge';
import { DataTable, type DataTableColumn } from '~/components/ui/data-table';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';
import { formatCurrency, formatPercent } from '~/lib/format';
import {
    type Plan,
    type PlanOptIns,
    rankablePlans,
    type SimInputs,
    type SimOutputs,
    simulate,
    type TradingFirm,
    withPlanOptIns,
} from '~/lib/prop-calculator';
import { SizingObjective } from '~/lib/prop-calculator/advisor';
import { simInputsSizingIssue } from '~/lib/prop-calculator/simulator';
import { cn } from '~/lib/utilities';

import { ComputationId } from './ComputationId';
import {
    ComparisonRankingLabel,
    ComparisonRankingNote,
    ComparisonScreenHourToolbar,
    noPayoutColumn,
    screenHourColumn,
    useComparisonView,
} from './FirmComparisonTable';
import { panelDescriptions } from './kpiDescriptions';
import { ptddColor } from './metricColors';
import {
    bestExpectedMonthlyNet,
    monthlyNetScoreText,
    scoreByExpectedMonthlyNet,
} from './scoring';
import { type ScreenHourFilters } from './ScreenHourFilters';
import { simInputsCacheKey, SimInputsKeyField } from './simInputsCacheKey';
import { passDaysColumn, roiColumn } from './simOutputColumns';
import { SimulationFailureNotice } from './SimulationFailureNotice';
import { useSectionComputing } from './ToolSection';
import { useDebouncedComputation } from './useDebouncedSimulation';
import {
    openInSimulatorColumn,
    useOpenInSimulator,
} from './useOpenInSimulator';

const DEBOUNCE_MS = 600;
const MAX_TRIALS = 500;

export interface Row {
    isBest: boolean;
    out: SimOutputs;
    plan: Plan;
    ptdd: number;
    score: number;
}

interface PlanComparisonTableProperties {
    activePlan: Plan;
    bankrollCents?: null | number;
    baseInputs: Omit<SimInputs, 'plan'>;
    firm: TradingFirm;
    isBankrollPending?: boolean;
    objective?: SizingObjective;
    planOptIns: PlanOptIns;
    screenHourFilters?: ScreenHourFilters;
}

export default function PlanComparisonTable({
    activePlan,
    bankrollCents = null,
    baseInputs,
    firm,
    isBankrollPending = false,
    objective = SizingObjective.MonthlyNet,
    planOptIns,
    screenHourFilters,
}: PlanComparisonTableProperties) {
    const key = buildCacheKey(baseInputs, firm.id, planOptIns);
    const {
        error,
        pending,
        result: rows,
    } = useDebouncedComputation(
        ComputationId.PlanComparison,
        key,
        DEBOUNCE_MS,
        () => {
            const trials = Math.min(MAX_TRIALS, baseInputs.trials);
            const partial = rankablePlans(firm.plans, false).map((plan) => ({
                out: simulate({
                    ...baseInputs,
                    plan: withPlanOptIns(plan, planOptIns),
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
        simInputsSizingIssue(baseInputs),
    );

    const openInSimulator = useOpenInSimulator(planOptIns);
    useSectionComputing(pending);

    const {
        accountsPerSession,
        hasScreenHourInputs,
        hoursPerDay,
        inputs,
        ranked,
        shownRows,
    } = useComparisonView(
        rows,
        {
            bankrollCents,
            isBankrollPending,
            objective,
            seed: baseInputs.seed,
        },
        screenHourFilters,
    );

    const columns = useMemo<DataTableColumn<Row>[]>(
        () => [
            {
                accessorFn: (r) => r.plan.label,
                cell: ({ row }) => row.original.plan.label,
                header: 'Plan',
                id: 'plan',
                meta: { isRowHeader: true },
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
            passDaysColumn<Row>(),
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
                accessorFn: (r) => r.out.expectedNet,
                cell: ({ row }) => formatCurrency(row.original.out.expectedNet),
                header: 'Cycle net',
                id: 'cycleNet',
            },
            roiColumn<Row>(),
            {
                accessorFn: (r) => r.score,
                cell: ({ row }) => {
                    const isActive = row.original.plan === activePlan;
                    return (
                        <span className="flex items-center gap-1.5">
                            {monthlyNetScoreText(row.original.score)}
                            {row.original.isBest && !isActive && (
                                <Badge>Best</Badge>
                            )}
                        </span>
                    );
                },
                header: 'Monthly net score',
                id: 'score',
            },
            noPayoutColumn<Row>(),
            ...(hasScreenHourInputs && hoursPerDay && accountsPerSession
                ? [screenHourColumn<Row>(hoursPerDay, accountsPerSession)]
                : []),
            openInSimulatorColumn<Row>((row) =>
                openInSimulator(firm, row.plan),
            ),
        ],
        [
            accountsPerSession,
            activePlan,
            firm,
            hasScreenHourInputs,
            hoursPerDay,
            openInSimulator,
        ],
    );

    return (
        <div className="app-prop-calculator__plan-comparison flex flex-col gap-4">
            <InfoNote
                info={panelDescriptions.planComparison}
                infoTitle="Plan comparison"
            >
                <ComparisonRankingLabel ranked={ranked} />
            </InfoNote>
            {screenHourFilters === undefined ? (
                <ComparisonScreenHourToolbar
                    filters={inputs}
                    idPrefix="plan-comparison"
                    label="Plan comparison filters"
                />
            ) : null}
            <ComparisonRankingNote ranked={ranked} />
            {rows.length === 0 ? null : (
                <p className="m-0 text-xs text-muted-foreground">
                    {planCountText(shownRows.length, rows.length)}
                </p>
            )}
            {error === null ? (
                <DataTable<Row>
                    className="app-prop-calculator__plan-comparison-table text-xs tabular-nums"
                    columns={columns}
                    data={shownRows}
                    emptyState={
                        <EmptyState
                            icon={Layers}
                            size={EmptyStateSize.Compact}
                            title="No plans"
                        />
                    }
                    isLoading={pending && rows.length === 0}
                    pageSize={null}
                    rowClassName={(r) =>
                        r.plan === activePlan
                            ? 'bg-primary/10 font-semibold text-foreground'
                            : undefined
                    }
                    rowId={(r) => JSON.stringify(r.plan.id)}
                />
            ) : (
                <SimulationFailureNotice message={error} />
            )}
        </div>
    );
}

function buildCacheKey(
    inputs: Omit<SimInputs, 'plan'>,
    firmId: string,
    optIns: PlanOptIns,
): string {
    return simInputsCacheKey(inputs, {
        extra: { firmId, optIns },
        omit: [SimInputsKeyField.PlanId],
    });
}

function planCountText(shown: number, total: number): string {
    const noun = total === 1 ? 'plan' : 'plans';
    return shown < total
        ? `showing ${shown} of ${total} ${noun}`
        : `${total} ${noun}`;
}
