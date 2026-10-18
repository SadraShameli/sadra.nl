'use client';

import { Building2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { FilterToolbar } from '~/components/FilterToolbar';
import { InfoNote } from '~/components/InfoNote';
import { StatusRow, StatusTone } from '~/components/StatusRow';
import { DataTable, type DataTableColumn } from '~/components/ui/data-table';
import { EmptyState } from '~/components/ui/empty-state';
import InfoPopover from '~/components/ui/info-popover';
import {
    formatCurrency,
    formatDays,
    formatOptionalPercent,
    formatPercent,
    NOT_APPLICABLE,
} from '~/lib/format';
import {
    dollars,
    type FirmId,
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
import {
    netPerScreenHour,
    noPayoutProbabilityFromDistribution,
} from '~/lib/prop-calculator/economics';
import { simInputsSizingIssue } from '~/lib/prop-calculator/simulator';

import { ComputationId } from './ComputationId';
import { panelDescriptions } from './kpiDescriptions';
import {
    BatchLossCache,
    type PricedComparisonRow,
    rankComparison,
    type RankedComparison,
} from './objectiveRanking';
import {
    bestExpectedMonthlyNet,
    monthlyNetScoreText,
    scoreByExpectedMonthlyNet,
} from './scoring';
import {
    parseAccountsPerSession,
    parsePositiveNumber,
    parseTopLimit,
    type ScreenHourFilters,
    ScreenHourInputs,
    useScreenHourFilters,
} from './ScreenHourFilters';
import { simInputsCacheKey, SimInputsKeyField } from './simInputsCacheKey';
import { SimulationFailureNotice } from './SimulationFailureNotice';
import { useDebouncedComputation } from './useDebouncedSimulation';
import {
    openInSimulatorColumn,
    useOpenInSimulator,
} from './useOpenInSimulator';

const DEBOUNCE_MS = 700;
const MAX_TRIALS = 500;

export interface ComparisonViewRequest {
    bankrollCents: null | number;
    isBankrollPending: boolean;
    objective: SizingObjective;
    seed: number;
}

export interface Row {
    firm: TradingFirm;
    out: SimOutputs;
    plan: Plan;
    score: number;
}

interface FirmComparisonTableProperties {
    activeFirmId: FirmId;
    bankrollCents?: null | number;
    baseInputs: Omit<SimInputs, 'plan'>;
    firms: readonly TradingFirm[];
    isBankrollPending?: boolean;
    objective?: SizingObjective;
    planOptIns: PlanOptIns;
    screenHourFilters?: ScreenHourFilters;
    targetAccountSize: number;
}

export function ComparisonRankingLabel({
    ranked,
}: {
    ranked: Pick<RankedComparison<unknown>, 'label'>;
}) {
    return (
        <>
            Ranked by {ranked.label}; a column header click re-sorts the rows
            shown
        </>
    );
}

export function ComparisonRankingNote({
    ranked,
}: {
    ranked: Pick<RankedComparison<unknown>, 'note'>;
}) {
    return ranked.note === null ? null : (
        <StatusRow title={ranked.note} tone={StatusTone.Warn} />
    );
}

export function ComparisonScreenHourToolbar({
    filters,
    idPrefix,
    label,
}: {
    filters: ScreenHourFilters;
    idPrefix: string;
    label: string;
}) {
    return (
        <FilterToolbar label={label}>
            <ScreenHourInputs idPrefix={idPrefix} {...filters} />
        </FilterToolbar>
    );
}

export default function FirmComparisonTable({
    activeFirmId,
    bankrollCents = null,
    baseInputs,
    firms,
    isBankrollPending = false,
    objective = SizingObjective.MonthlyNet,
    planOptIns,
    screenHourFilters,
    targetAccountSize,
}: FirmComparisonTableProperties) {
    const key = buildCacheKey(baseInputs, targetAccountSize, planOptIns);
    const {
        error,
        pending,
        result: rows,
    } = useDebouncedComputation(
        ComputationId.FirmComparison,
        key,
        DEBOUNCE_MS,
        () => {
            const trials = Math.min(MAX_TRIALS, baseInputs.trials);
            const partial: Omit<Row, 'score'>[] = [];
            for (const firm of firms) {
                const plan = pickPlan(firm, targetAccountSize);
                if (!plan) continue;
                const sim = simulate({
                    ...baseInputs,
                    plan: withPlanOptIns(plan, planOptIns),
                    trials,
                });
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
        simInputsSizingIssue(baseInputs),
    );

    const openInSimulator = useOpenInSimulator(planOptIns);

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
                accessorFn: (r) => r.firm.displayName,
                cell: ({ row }) => {
                    const { firm } = row.original;
                    return (
                        <span className="flex items-center gap-1.5">
                            {firm.displayName}
                            {firm.notes.length > 0 && (
                                <InfoPopover title={firm.displayName}>
                                    {firm.notes.map((note) => (
                                        <p key={note}>{note}</p>
                                    ))}
                                </InfoPopover>
                            )}
                        </span>
                    );
                },
                header: 'Firm',
                id: 'firm',
                meta: { isRowHeader: true },
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
                accessorFn: (r) => r.out.expectedNet,
                cell: ({ row }) => formatCurrency(row.original.out.expectedNet),
                header: 'Cycle net',
                id: 'cycleNet',
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
                cell: ({ row }) => monthlyNetScoreText(row.original.score),
                header: 'Monthly net score',
                id: 'score',
            },
            noPayoutColumn<Row>(),
            ...(hasScreenHourInputs && hoursPerDay && accountsPerSession
                ? [screenHourColumn<Row>(hoursPerDay, accountsPerSession)]
                : []),
            openInSimulatorColumn<Row>((row) =>
                openInSimulator(row.firm, row.plan),
            ),
        ],
        [accountsPerSession, hasScreenHourInputs, hoursPerDay, openInSimulator],
    );

    return (
        <div className="app-prop-calculator__firm-comparison flex flex-col gap-4">
            <InfoNote
                info={panelDescriptions.firmComparison}
                infoTitle="Firm comparison"
            >
                <ComparisonRankingLabel ranked={ranked} />
            </InfoNote>
            {screenHourFilters === undefined ? (
                <ComparisonScreenHourToolbar
                    filters={inputs}
                    idPrefix="firm-comparison"
                    label="Firm comparison filters"
                />
            ) : null}
            <ComparisonRankingNote ranked={ranked} />
            <p className="m-0 text-xs text-muted-foreground">
                {pending
                    ? 'computing…'
                    : `closest plan to $${(targetAccountSize / 1000).toFixed(0)}K${shownRows.length < ranked.rows.length ? `, showing ${shownRows.length} of ${ranked.rows.length}` : ''}`}
            </p>
            {error === null ? (
                <DataTable<Row>
                    className="app-prop-calculator__firm-comparison-table text-xs tabular-nums"
                    columns={columns}
                    data={shownRows}
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
            ) : (
                <SimulationFailureNotice message={error} />
            )}
        </div>
    );
}

export function limitRows<Row>(
    rows: readonly Row[],
    limit: null | number,
): Row[] {
    return limit === null ? [...rows] : rows.slice(0, limit);
}

export function noPayoutColumn<
    Row extends { out: SimOutputs },
>(): DataTableColumn<Row> {
    const valueOf = (row: Row): null | number =>
        noPayoutProbabilityFromDistribution(
            row.out.fundedPayoutCountDistribution,
        );
    return {
        accessorFn: (r) => valueOf(r) ?? undefined,
        cell: ({ row }) => {
            const value = valueOf(row.original);
            return value === null ? NOT_APPLICABLE : formatPercent(value);
        },
        header: 'P(no payout)',
        id: 'noPayout',
        sortUndefined: 'last',
    };
}

export function screenHourColumn<Row extends { out: SimOutputs }>(
    hoursPerDay: number,
    accountsPerSession: number,
): DataTableColumn<Row> {
    const valueOf = (row: Row): null | number => {
        const estimate = netPerScreenHour({
            accountsPerSession,
            expectedMonthlyNet: dollars(row.out.expectedMonthlyNet),
            sessionHoursPerDay: hoursPerDay,
        }).value;
        return estimate === null ? null : estimate.value;
    };
    return {
        accessorFn: (r) => valueOf(r) ?? undefined,
        cell: ({ row }) => {
            const value = valueOf(row.original);
            return value === null ? NOT_APPLICABLE : formatCurrency(value);
        },
        header: '$/screen hour',
        id: 'netPerScreenHour',
        sortUndefined: 'last',
    };
}

export function useComparisonView<Row extends PricedComparisonRow>(
    rows: readonly Row[],
    request: ComparisonViewRequest,
    sharedFilters?: ScreenHourFilters,
) {
    const { bankrollCents, isBankrollPending, objective, seed } = request;
    const ownFilters = useScreenHourFilters();
    const inputs = sharedFilters ?? ownFilters;
    const [batchLossCache] = useState(() => new BatchLossCache());
    const hoursPerDay = parsePositiveNumber(inputs.hoursPerDayInput);
    const accountsPerSession = parseAccountsPerSession(
        inputs.accountsPerSessionInput,
    );
    const hasScreenHourInputs =
        hoursPerDay !== null && accountsPerSession !== null;
    const ranked = useMemo(() => {
        const result = rankComparison(rows, {
            bankrollCents,
            batchLoss: (row, bankroll) =>
                batchLossCache.pricing(row.out, bankroll, seed),
            objective,
        });
        return isBankrollPending ? { ...result, note: null } : result;
    }, [
        bankrollCents,
        batchLossCache,
        isBankrollPending,
        objective,
        rows,
        seed,
    ]);
    const shownRows = limitRows(
        ranked.rows,
        hasScreenHourInputs ? parseTopLimit(inputs.topLimitInput) : null,
    );
    return {
        accountsPerSession,
        hasScreenHourInputs,
        hoursPerDay,
        inputs,
        ranked,
        shownRows,
    };
}

function buildCacheKey(
    inputs: Omit<SimInputs, 'plan'>,
    accountSize: number,
    optIns: PlanOptIns,
): string {
    return simInputsCacheKey(inputs, {
        extra: { accountSize, optIns },
        omit: [SimInputsKeyField.PlanId],
    });
}

function pickPlan(firm: TradingFirm, targetSize: number): null | Plan {
    const candidates = rankablePlans(firm.plans, false);
    const sameSize = candidates.filter((p) => p.accountSize === targetSize);
    if (sameSize.length > 0) {
        return sameSize.reduce<null | Plan>((best, p) => {
            if (!best) return p;
            return p.profitTarget < best.profitTarget ? p : best;
        }, null);
    }
    let closest: null | Plan = null;
    let closestDiff = Infinity;
    for (const p of candidates) {
        const diff = Math.abs(p.accountSize - targetSize);
        if (!(diff < closestDiff)) {
            continue;
        }

        closest = p;
        closestDiff = diff;
    }
    return closest;
}
