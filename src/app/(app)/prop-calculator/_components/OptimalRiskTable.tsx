'use client';

import { Target } from 'lucide-react';
import { useMemo, useRef } from 'react';

import { InfoNote } from '~/components/InfoNote';
import { DataTable, type DataTableColumn } from '~/components/ui/data-table';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';
import {
    formatCurrency,
    formatDays,
    formatOptionalPercent,
    formatPercent,
    formatStreak,
} from '~/lib/format';
import {
    type Dollars,
    type Plan,
    type SimInputs,
    type SimOutputs,
    simulate,
} from '~/lib/prop-calculator';
import {
    type BankrollRiskFigures,
    bankrollRiskFigures,
} from '~/lib/prop-calculator/economics';

import {
    AppliedEvalLadderNotice,
    EvalLadderScope,
} from './AppliedEvalLadderNotice';
import { RulebookSourceNotice } from './bankroll/RulebookSourceNotice';
import { useBankrollVariant } from './bankroll/useBankrollVariant';
import { useCalculatorInputs } from './CalculatorProvider';
import { ComputationId } from './ComputationId';
import { panelDescriptions } from './kpiDescriptions';
import { NO_PASS_DAYS_REASON } from './missingReasons';
import { CalculatorObjectiveChip } from './ObjectiveChip';
import {
    documentedSizingHeadline,
    ENGINE_OPTIMUM_NOTE,
    riskRowFigures,
    riskTableObjective,
    starredRows,
} from './objectiveRanking';
import { riskPercentToDollars } from './riskConversion';
import { simInputsCacheKey, SimInputsKeyField } from './simInputsCacheKey';
import { roiColumn } from './simOutputColumns';
import { partitionBySizing } from './simulationFailure';
import { SimulationFailureNotice } from './SimulationFailureNotice';
import { useSectionComputing } from './ToolSection';
import { useDebouncedComputation } from './useDebouncedSimulation';
import { ValueOrMissing } from './ValueOrMissing';

const RISK_LEVELS = [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5] as const;
const DEBOUNCE_MS = 500;
const MAX_TRIALS = 500;

export interface Row {
    accountSize: number;
    bankroll: BankrollRiskFigures | null;
    out: SimOutputs;
    riskPct: number;
}

interface OptimalRiskTableProperties {
    bankroll?: Dollars | null;
    baseInputs: Omit<SimInputs, 'riskPerTrade'>;
    currentRiskPercent: number;
    plan: Plan;
}

export default function OptimalRiskTable({
    bankroll = null,
    baseInputs,
    currentRiskPercent,
    plan,
}: OptimalRiskTableProperties) {
    const { state } = useCalculatorInputs();
    const { rulebook, rulebookSource } = useBankrollVariant();
    const objectiveView = riskTableObjective(state.objective);
    const key = buildCacheKey(baseInputs, bankroll);
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
            return levels.accepted.map((riskPct): Row => {
                const riskDollars = riskPercentToDollars(riskPct, accountSize);
                const out = simulate({
                    ...baseInputs,
                    evalDayPolicy: undefined,
                    riskPerTrade: riskDollars,
                    trials,
                });
                return {
                    accountSize,
                    bankroll:
                        bankroll === null
                            ? null
                            : bankrollRiskFigures(
                                  out,
                                  bankroll,
                                  baseInputs.seed,
                              ),
                    out,
                    riskPct,
                };
            });
        },
        [],
    );

    const cardReference = useRef<HTMLDivElement>(null);
    useSectionComputing(pending);

    const starred = useMemo(
        () =>
            starredRows(rows, objectiveView.effective, (row) =>
                riskRowFigures(row.out),
            ),
        [objectiveView.effective, rows],
    );
    const bestRow = useMemo(
        () => rows.find((r) => starred.has(r)) ?? null,
        [rows, starred],
    );

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
                        {starred.has(row.original) &&
                            row.original.riskPct !== closestRiskPct && (
                                <span className="ml-1 text-success">★</span>
                            )}
                    </>
                ),
                header: 'Risk',
                id: 'risk',
                meta: { isRowHeader: true },
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
                cell: ({ row }) => (
                    <ValueOrMissing
                        reason={NO_PASS_DAYS_REASON}
                        value={formatDays(row.original.out.daysToPassP50)}
                    />
                ),
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
                accessorFn: (r) => r.out.expectedNet,
                cell: ({ row }) => formatCurrency(row.original.out.expectedNet),
                header: 'Cycle net',
                id: 'cycleNet',
            },
            ...(bankroll === null ? [] : bankrollColumns()),
            roiColumn<Row>(),
            {
                accessorFn: (r) => r.out.maxLosingStreakP95,
                cell: ({ row }) =>
                    formatStreak(row.original.out.maxLosingStreakP95),
                header: 'Streak P95',
                id: 'streak',
            },
        ],
        [bankroll, closestRiskPct, starred],
    );

    return (
        <div
            className="app-prop-calculator__optimal-risk flex flex-col gap-4 outline-none"
            ref={cardReference}
            tabIndex={-1}
        >
            <InfoNote
                info={
                    <>
                        <p>{panelDescriptions.optimalRiskSweep}</p>
                        <p>{ENGINE_OPTIMUM_NOTE}</p>
                        {bankroll !== null && (
                            <p>
                                Bankroll figures are priced at{' '}
                                {formatCurrency(bankroll)}: attempts affordable
                                are the bankroll over the cost per attempt, P(no
                                payout) is across those attempts and P(batch
                                &lt; 0) is the chance they end below zero.
                            </p>
                        )}
                    </>
                }
                infoTitle="Optimal risk sweep"
            >
                {documentedSizingHeadline(rulebook, rulebookSource)}
            </InfoNote>
            <RulebookSourceNotice source={rulebookSource} />
            <CalculatorObjectiveChip />
            {bestRow === null ? null : (
                <p className="m-0 text-xs text-muted-foreground">
                    {`engine optimum for ${riskTableObjective(objectiveView.effective).label} at ${formatPercent(
                        bestRow.riskPct / 100,
                        2,
                    )}`}
                </p>
            )}
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
                        size={EmptyStateSize.Compact}
                        title="No data yet"
                    />
                }
                isLoading={pending && rows.length === 0}
                pageSize={null}
                rowClassName={(r) =>
                    r.riskPct === closestRiskPct
                        ? 'bg-primary/10 font-semibold text-foreground'
                        : undefined
                }
                rowId={(r) => String(r.riskPct)}
            />
        </div>
    );
}

function bankrollColumns(): DataTableColumn<Row>[] {
    return [
        {
            accessorFn: (r) => r.bankroll?.noPayoutProbability ?? undefined,
            cell: ({ row }) => (
                <ValueOrMissing
                    value={formatOptionalPercent(
                        row.original.bankroll?.noPayoutProbability ?? null,
                    )}
                />
            ),
            header: 'P(no payout)',
            id: 'noPayout',
            sortUndefined: 'last',
        },
        {
            accessorFn: (r) => r.bankroll?.lossProbability ?? undefined,
            cell: ({ row }) => (
                <ValueOrMissing
                    value={formatOptionalPercent(
                        row.original.bankroll?.lossProbability ?? null,
                    )}
                />
            ),
            header: 'P(batch < 0)',
            id: 'batchLoss',
            sortUndefined: 'last',
        },
    ];
}

function buildCacheKey(
    inputs: Omit<SimInputs, 'riskPerTrade'>,
    bankroll: Dollars | null,
): string {
    return `${simInputsCacheKey(inputs, {
        omit: [SimInputsKeyField.EvalDayPolicy, SimInputsKeyField.RiskPerTrade],
    })}|bankroll=${bankroll?.toString() ?? ''}`;
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
