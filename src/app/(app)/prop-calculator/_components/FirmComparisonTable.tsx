'use client';

import { Building2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Card } from '~/components/ui/Card';
import { DataTable, type DataTableColumn } from '~/components/ui/DataTable';
import { EmptyState } from '~/components/ui/EmptyState';
import InfoPopover from '~/components/ui/InfoPopover';
import { Input } from '~/components/ui/Input';
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
import {
    netPerScreenHour,
    noPayoutProbabilityFromDistribution,
} from '~/lib/prop-calculator/economics';
import { simInputsSizingIssue } from '~/lib/prop-calculator/simulator';
import { cn } from '~/lib/utilities';

import { ComputationId } from './ComputationId';
import { panelDescriptions } from './kpiDescriptions';
import { bestExpectedMonthlyNet, scoreByExpectedMonthlyNet } from './scoring';
import { simInputsCacheKey, SimInputsKeyField } from './simInputsCacheKey';
import { SimulationFailureNotice } from './SimulationFailureNotice';
import { useDebouncedComputation } from './useDebouncedSimulation';
import {
    openInSimulatorColumn,
    useOpenInSimulator,
} from './useOpenInSimulator';

const DEBOUNCE_MS = 700;
const MAX_TRIALS = 500;

export interface Row {
    firm: TradingFirm;
    out: SimOutputs;
    plan: Plan;
    score: number;
}

interface FirmComparisonTableProperties {
    activeFirmId: FirmId;
    baseInputs: Omit<SimInputs, 'plan'>;
    firms: readonly TradingFirm[];
    planOptIns: PlanOptIns;
    targetAccountSize: number;
}

export default function FirmComparisonTable({
    activeFirmId,
    baseInputs,
    firms,
    planOptIns,
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

    const [hoursPerDayInput, setHoursPerDayInput] = useState('');
    const [accountsPerSessionInput, setAccountsPerSessionInput] = useState('');
    const hoursPerDay = parsePositiveNumber(hoursPerDayInput);
    const accountsPerSession = parseAccountsPerSession(accountsPerSessionInput);
    const hasScreenHourInputs =
        hoursPerDay !== null && accountsPerSession !== null;

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
                accessorFn: (r) => r.out.roiOnCost.value ?? undefined,
                cell: ({ row }) =>
                    formatOptionalPercent(row.original.out.roiOnCost.value),
                header: 'ROI',
                id: 'roi',
                sortUndefined: 'last',
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
            <ScreenHourInputs
                accountsPerSessionInput={accountsPerSessionInput}
                hoursPerDayInput={hoursPerDayInput}
                idPrefix="firm-comparison"
                onAccountsPerSessionChange={setAccountsPerSessionInput}
                onHoursPerDayChange={setHoursPerDayInput}
            />
            {error === null ? (
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
            ) : (
                <SimulationFailureNotice message={error} />
            )}
        </Card>
    );
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

export function parseAccountsPerSession(text: string): null | number {
    if (text.trim() === '') return null;
    const n = Number(text);
    return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

export function parsePositiveNumber(text: string): null | number {
    if (text.trim() === '') return null;
    const n = Number(text);
    return Number.isFinite(n) && n > 0 ? n : null;
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

export function ScreenHourInputs({
    accountsPerSessionInput,
    hoursPerDayInput,
    idPrefix,
    onAccountsPerSessionChange,
    onHoursPerDayChange,
}: {
    accountsPerSessionInput: string;
    hoursPerDayInput: string;
    idPrefix: string;
    onAccountsPerSessionChange: (value: string) => void;
    onHoursPerDayChange: (value: string) => void;
}) {
    const hoursHintId = `${idPrefix}-hours-per-day-hint`;
    const accountsHintId = `${idPrefix}-accounts-per-session-hint`;
    const isHoursInvalid =
        hoursPerDayInput.trim() !== '' &&
        parsePositiveNumber(hoursPerDayInput) === null;
    const isAccountsInvalid =
        accountsPerSessionInput.trim() !== '' &&
        parseAccountsPerSession(accountsPerSessionInput) === null;
    return (
        <div className="flex flex-wrap items-end gap-3">
            <div>
                <label
                    className="mb-1 block text-[11px] text-muted-foreground"
                    htmlFor={`${idPrefix}-hours-per-day`}
                >
                    Hours per day
                </label>
                <Input
                    aria-describedby={isHoursInvalid ? hoursHintId : undefined}
                    aria-invalid={isHoursInvalid}
                    aria-label="Hours per day"
                    className="h-7 w-16 text-xs"
                    id={`${idPrefix}-hours-per-day`}
                    min={0}
                    onChange={(event) =>
                        onHoursPerDayChange(event.target.value)
                    }
                    placeholder="off"
                    step={0.5}
                    type="number"
                    value={hoursPerDayInput}
                />
                {isHoursInvalid ? (
                    <p
                        className="mt-1 text-[11px] text-amber-400"
                        id={hoursHintId}
                    >
                        A number of hours above 0
                    </p>
                ) : null}
            </div>
            <div>
                <label
                    className="mb-1 block text-[11px] text-muted-foreground"
                    htmlFor={`${idPrefix}-accounts-per-session`}
                >
                    Accounts per session
                </label>
                <Input
                    aria-describedby={
                        isAccountsInvalid ? accountsHintId : undefined
                    }
                    aria-invalid={isAccountsInvalid}
                    aria-label="Accounts per session"
                    className="h-7 w-16 text-xs"
                    id={`${idPrefix}-accounts-per-session`}
                    min={1}
                    onChange={(event) =>
                        onAccountsPerSessionChange(event.target.value)
                    }
                    placeholder="off"
                    step={1}
                    type="number"
                    value={accountsPerSessionInput}
                />
                {isAccountsInvalid ? (
                    <p
                        className="mt-1 text-[11px] text-amber-400"
                        id={accountsHintId}
                    >
                        Whole number, at least 1
                    </p>
                ) : null}
            </div>
        </div>
    );
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
