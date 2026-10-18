'use client';

import { ChartColumn, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { InfoNote } from '~/components/InfoNote';
import { MissingValue } from '~/components/MissingValue';
import {
    editRowAction,
    RowActionKind,
    rowActionsColumn,
} from '~/components/RowActionsMenu';
import { StatStrip, StatStripSize } from '~/components/StatStrip';
import { StatusRow, StatusTone } from '~/components/StatusRow';
import { ToolPanel } from '~/components/ToolPanel';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { DataTable, type DataTableColumn } from '~/components/ui/data-table';
import { Dialog } from '~/components/ui/dialog';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';
import { Skeleton } from '~/components/ui/skeleton';
import {
    formatCompactCurrency,
    formatCurrency,
    formatPercent,
} from '~/lib/format';
import {
    CorrelationMode,
    LiveTransferContinuationKind,
    type Plan,
    type RungSizing,
} from '~/lib/prop-calculator';
import {
    ECONOMICS_DISCLOSURE_TEXT,
    ECONOMICS_REASON_TEXT,
    EconomicsDisclosure,
} from '~/lib/prop-calculator/economics';
import {
    LIVE_TRANSFER_CONCLUDING_PAYOUT_TEXT,
    LIVE_TRANSFER_CONTINUATION_TEXT,
    liveTransferContinuationNotes,
    liveTransferHazardPercentText,
} from '~/lib/prop-calculator/simulator';
import { MAX_LAB_SCENARIOS } from '~/lib/schemas/url';
import { cn } from '~/lib/utilities';

import AccountsPassedDistributionChart from './AccountsPassedDistributionChart';
import { nextLabScenario } from './calculatorReducer';
import { DayStopRuleStyle, describeDayStopRule } from './describeDayStopRule';
import { CORRELATION_LABEL, LabScenarioDialog } from './LabScenarioDialog';
import { PanelSkeleton, PanelSkeletonSize } from './PanelSkeleton';
import { SimulationFailureNotice } from './SimulationFailureNotice';
import { type LabLinkOutcome, LabLinkStatus, type LabScenario } from './types';
import { type LabResult, useLabSimulation } from './useLabSimulation';

const NOT_SIMULATED_REASON =
    'This scenario was not simulated; the notice above the table says why.';
const NO_STOP_REASON = 'This scenario sets no stop distance.';
const NO_GROUPS_REASON = 'Groups apply to group-split scenarios only.';

interface LabScenarioEdit {
    isNew: boolean;
    scenario: LabScenario;
}

interface StrategyLabPanelProperties {
    activationDiscountPercent: number;
    commissionPerRoundTrip: number;
    evalDiscountPercent: number;
    fundedHorizonDays: number;
    labLink: LabLinkOutcome;
    linkActivationDiscount: boolean;
    liveTransferHazard?: number;
    maxEvalDays: number;
    minRetainedCushion: number | undefined;
    monthlySubscriptionDiscountPercent: number;
    onAdd: (scenario: LabScenario) => void;
    onRemove: (id: string) => void;
    onReset: () => void;
    onUpdate: (id: string, patch: Partial<LabScenario>) => void;
    payoutRequestSize: number | undefined;
    plan: Plan;
    resetDiscountPercent: number;
    rungSizing: RungSizing | undefined;
    scenarios: LabScenario[];
    seed: number;
}

interface StrategyLabRow {
    isComputing: boolean;
    isVerdict: boolean;
    onlyOne: boolean;
    result: LabResult | undefined;
    scenario: LabScenario;
}

export default function StrategyLabPanel({
    activationDiscountPercent,
    commissionPerRoundTrip,
    evalDiscountPercent,
    fundedHorizonDays,
    labLink,
    linkActivationDiscount,
    liveTransferHazard,
    maxEvalDays,
    minRetainedCushion,
    monthlySubscriptionDiscountPercent,
    onAdd,
    onRemove,
    onReset,
    onUpdate,
    payoutRequestSize,
    plan,
    resetDiscountPercent,
    rungSizing,
    scenarios,
    seed,
}: StrategyLabPanelProperties) {
    const { error, pending, refused, results } = useLabSimulation({
        activationDiscountPercent,
        commissionPerRoundTrip,
        discountPercent: evalDiscountPercent,
        fundedHorizonDays,
        linkActivationDiscount,
        liveTransferHazard,
        maxEvalDays,
        minRetainedCushion,
        monthlySubscriptionDiscountPercent,
        payoutRequestSize,
        plan,
        resetDiscountPercent,
        rungSizing,
        scenarios,
        seed,
    });
    const isHazardPriced =
        liveTransferHazard !== undefined && liveTransferHazard > 0;
    const refusedIds = new Set(refused.map((refusal) => refusal.item.id));
    const isAwaitingResult = (id: string) =>
        error === null && !refusedIds.has(id) && !results.has(id);

    const verdict = useMemo(() => {
        if (results.size === 0) return null;
        let best: null | { id: string; monthly: number; score: number } = null;
        for (const sc of scenarios) {
            const r = results.get(sc.id);
            if (!r || r.pAtLeastFundedSurvival.kHalf < 0.5) continue;
            if (!best || r.expectedMonthlyNet > best.monthly) {
                best = {
                    id: sc.id,
                    monthly: r.expectedMonthlyNet,
                    score: r.expectedMonthlyNet,
                };
            }
        }
        if (best) return best;
        let fallback: null | { id: string; monthly: number; score: number } =
            null;
        for (const sc of scenarios) {
            const r = results.get(sc.id);
            if (!r) continue;
            if (!fallback || r.expectedMonthlyNet > fallback.monthly) {
                fallback = {
                    id: sc.id,
                    monthly: r.expectedMonthlyNet,
                    score: r.expectedMonthlyNet,
                };
            }
        }
        return fallback;
    }, [results, scenarios]);

    const verdictScenario = verdict
        ? scenarios.find((s) => s.id === verdict.id)
        : null;
    const verdictResult = verdict ? results.get(verdict.id) : null;
    const [editing, setEditing] = useState<LabScenarioEdit | null>(null);

    return (
        <>
            <ToolPanel
                actions={
                    <>
                        <Button onClick={onReset} size="sm" variant="ghost">
                            <RotateCcw className="size-3.5" />
                            <span className="ml-1 text-xs">Reset</span>
                        </Button>
                        <Button
                            disabled={scenarios.length >= MAX_LAB_SCENARIOS}
                            onClick={() =>
                                setEditing({
                                    isNew: true,
                                    scenario: nextLabScenario(scenarios),
                                })
                            }
                            size="sm"
                            variant="outline"
                        >
                            <Plus className="size-3.5" />
                            <span className="ml-1 text-xs">Add scenario</span>
                        </Button>
                    </>
                }
                className="app-prop-calculator__strategy-lab"
                info={
                    <>
                        <p>
                            Compare execution strategies across multiple
                            accounts. Each row is a scenario with its own risk
                            sizing, win rate, frequency, and account
                            correlation:
                        </p>
                        <ul className="mt-2 list-disc pl-4">
                            <li>
                                <strong>Copy-trade</strong>: all accounts share
                                the same outcome, a bimodal distribution.
                            </li>
                            <li>
                                <strong>Group-split</strong>: accounts split
                                into independent groups. Different time windows
                                are modelled identically to independent groups
                                here.
                            </li>
                            <li>
                                <strong>Independent</strong>: every account
                                trades fully independently.
                            </li>
                        </ul>
                        <p className="mt-2">
                            Theo is the exact pass probability of a simple
                            random walk with a fixed drawdown floor: each trade
                            wins RR times the risk or loses the risk until the
                            balance reaches the profit target or falls to the
                            starting balance minus the drawdown. It is a{' '}
                            {
                                ECONOMICS_DISCLOSURE_TEXT[
                                    EconomicsDisclosure.RandomWalkApproximation
                                ]
                            }
                            . When the walk cannot be solved, the cell shows a
                            dash with an info button that says why. In the
                            simulation, day-stop modifies the per-day trade loop
                            (stop after first win, after K losses, or after a $
                            target). MC eval pass, P(≥k) and E[#pass] count
                            accounts that passed the evaluation; MC survive
                            counts accounts that also never busted the funded
                            account. The verdict only recommends a scenario
                            where at least half the accounts survive funded in
                            50% of runs.
                        </p>
                    </>
                }
                isComputing={pending}
                title="Scenarios"
                titleAs="h3"
            >
                {labLink.status === LabLinkStatus.Rejected && (
                    <Alert variant="destructive">
                        <AlertDescription className="text-xs">
                            {`The lab scenarios in this link or saved scenario were rejected (${labLink.issue}), so the scenarios shown did not come from it.`}
                        </AlertDescription>
                    </Alert>
                )}
                {refused.map((refusal) => (
                    <SimulationFailureNotice
                        key={refusal.item.id}
                        message={`Not simulated, ${refusal.item.label}: ${refusal.issue}`}
                    />
                ))}
                <SimulationFailureNotice message={error} />
                {isHazardPriced && (
                    <InfoNote
                        info={
                            <>
                                <p>
                                    {`E[$/mo] includes it and ends each paid account's simulated payouts at a transfer, while E[$/mo] no transfer is the same scenario with the hazard at 0. A transferred account keeps its slot to the end of the funded horizon. Copy-traded accounts are sent live together. ${LIVE_TRANSFER_CONCLUDING_PAYOUT_TEXT}`}
                                </p>
                                {hazardContinuationNotes(
                                    results.values(),
                                    plan,
                                ).map((note) => (
                                    <p key={note}>{note}</p>
                                ))}
                            </>
                        }
                        infoTitle="Live-transfer hazard"
                    >
                        {`Live-transfer hazard of ${liveTransferHazardPercentText(liveTransferHazard)} per paid payout (your assumption, not a firm rule).`}
                    </InfoNote>
                )}
                <StrategyLabTable
                    isHazardPriced={isHazardPriced}
                    onEdit={(scenario) =>
                        setEditing({ isNew: false, scenario })
                    }
                    onRemove={onRemove}
                    pending={pending}
                    rows={scenarios.map((sc) => ({
                        isComputing: isAwaitingResult(sc.id),
                        isVerdict: verdict?.id === sc.id,
                        onlyOne: scenarios.length <= 1,
                        result: results.get(sc.id),
                        scenario: sc,
                    }))}
                />

                {verdict && verdictScenario && verdictResult && (
                    <StatusRow
                        detail={
                            verdictResult.pAtLeastFundedSurvival.kHalf >= 0.5
                                ? `P(≥${Math.ceil(
                                      verdictScenario.accounts / 2,
                                  )} of ${verdictScenario.accounts} survive funded) = ${formatPercent(
                                      verdictResult.pAtLeastFundedSurvival
                                          .kHalf,
                                  )}.`
                                : `Warning: P(≥½ survive funded) only ${formatPercent(
                                      verdictResult.pAtLeastFundedSurvival
                                          .kHalf,
                                  )}, so no scenario clears the 50% funded-survival bar.`
                        }
                        title={
                            <>
                                Verdict:{' '}
                                <strong>{verdictScenario.label}</strong> wins on
                                expected monthly net (
                                {formatCurrency(
                                    verdictResult.expectedMonthlyNet,
                                )}
                                ).
                            </>
                        }
                        tone={
                            verdictResult.pAtLeastFundedSurvival.kHalf >= 0.5
                                ? StatusTone.Pass
                                : StatusTone.Warn
                        }
                    />
                )}
                <Dialog
                    onOpenChange={(isOpen) => {
                        if (!isOpen) setEditing(null);
                    }}
                    open={editing !== null}
                >
                    {editing !== null && (
                        <LabScenarioDialog
                            initial={editing.scenario}
                            key={editing.scenario.id}
                            onCancel={() => setEditing(null)}
                            onSubmit={(scenario) => {
                                if (editing.isNew) {
                                    onAdd(scenario);
                                } else {
                                    onUpdate(scenario.id, scenario);
                                }
                                setEditing(null);
                            }}
                            submitLabel={editing.isNew ? 'Add' : 'Save'}
                            title={
                                editing.isNew ? 'Add scenario' : 'Edit scenario'
                            }
                        />
                    )}
                </Dialog>
            </ToolPanel>
            <div className="app-prop-calculator__strategy-lab-charts grid gap-4 lg:grid-cols-2">
                {scenarios.map((scenario) => (
                    <LabScenarioChartPanel
                        isComputing={isAwaitingResult(scenario.id)}
                        key={scenario.id}
                        result={results.get(scenario.id)}
                        scenario={scenario}
                    />
                ))}
            </div>
        </>
    );
}

function hazardColumns(): DataTableColumn<StrategyLabRow>[] {
    return [
        {
            accessorFn: (r) => r.result?.noTransferMonthlyNet ?? -Infinity,
            cell: ({ row }) => (
                <ResultCell
                    className="text-muted-foreground"
                    isComputing={row.original.isComputing}
                    value={
                        row.original.result?.noTransferMonthlyNet ?? undefined
                    }
                >
                    {(v) => formatCompactCurrency(v)}
                </ResultCell>
            ),
            header: 'E[$/mo] no transfer',
            id: 'monthly-no-transfer',
        },
        {
            accessorFn: (r) => r.result?.liveTransferProbability ?? -1,
            cell: ({ row }) => (
                <ResultCell
                    isComputing={row.original.isComputing}
                    value={row.original.result?.liveTransferProbability}
                >
                    {(v) => formatPercent(v)}
                </ResultCell>
            ),
            header: 'Sent live',
            id: 'sent-live',
        },
    ];
}

function hazardContinuationNotes(
    results: Iterable<LabResult>,
    plan: Plan,
): string[] {
    const kinds = new Set<LiveTransferContinuationKind>();
    for (const result of results) kinds.add(result.liveTransferContinuation);
    const notes = Object.values(LiveTransferContinuationKind)
        .flatMap((kind) =>
            kinds.has(kind)
                ? [
                      LIVE_TRANSFER_CONTINUATION_TEXT[kind],
                      ...liveTransferContinuationNotes(plan, kind),
                  ]
                : [],
        )
        .filter((note) => note !== '');
    return [...new Set(notes)];
}

function LabScenarioChartPanel({
    isComputing,
    result,
    scenario,
}: {
    readonly isComputing: boolean;
    readonly result: LabResult | undefined;
    readonly scenario: LabScenario;
}) {
    return (
        <ToolPanel
            className="app-prop-calculator__lab-scenario-chart"
            description={`${scenario.accounts} accts • ${CORRELATION_LABEL[scenario.correlation]} • ${describeDayStopRule(scenario.dayStop, DayStopRuleStyle.Compact)}`}
            isComputing={isComputing}
            title={scenario.label}
            titleAs="h3"
        >
            {result === undefined ? (
                isComputing ? (
                    <PanelSkeleton size={PanelSkeletonSize.Bar} />
                ) : (
                    <EmptyState
                        description={NOT_SIMULATED_REASON}
                        icon={ChartColumn}
                        size={EmptyStateSize.Compact}
                        title="No chart"
                    />
                )
            ) : (
                <>
                    {result.lifetimeCapPoolingGap !== null && (
                        <SimulationFailureNotice
                            message={result.lifetimeCapPoolingGap}
                        />
                    )}
                    <AccountsPassedDistributionChart
                        distribution={result.accountsPassDistribution}
                    />
                    <StatStrip
                        items={[
                            {
                                id: 'expected-max-loss-streak',
                                label: 'Expected max loss streak',
                                value: result.expectedMaxLossStreak.toFixed(1),
                            },
                            {
                                id: 'actual-trades-per-day',
                                label: 'Actual trades per day',
                                value: result.meanTradesPerDay.toFixed(2),
                            },
                        ]}
                        size={StatStripSize.Compact}
                    />
                </>
            )}
        </ToolPanel>
    );
}

function MonoCell({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return <span className={cn('font-mono', className)}>{children}</span>;
}

function ResultCell({
    children,
    className,
    isComputing,
    value,
}: {
    children: (v: number) => React.ReactNode;
    className?: string;
    isComputing: boolean;
    value: number | undefined;
}) {
    if (value !== undefined) {
        return <MonoCell className={className}>{children(value)}</MonoCell>;
    }
    return isComputing ? (
        <Skeleton className="h-4 w-12" />
    ) : (
        <MissingValue reason={NOT_SIMULATED_REASON} />
    );
}

function StrategyLabTable({
    isHazardPriced,
    onEdit,
    onRemove,
    pending,
    rows,
}: {
    isHazardPriced: boolean;
    onEdit: (scenario: LabScenario) => void;
    onRemove: (id: string) => void;
    pending: boolean;
    rows: StrategyLabRow[];
}) {
    const hasStopPoints = rows.some((row) => row.scenario.stopPoints !== null);
    const hasGroups = rows.some(
        (row) => row.scenario.correlation === CorrelationMode.Grouped,
    );
    const columns = useMemo<DataTableColumn<StrategyLabRow>[]>(
        () => [
            {
                cell: ({ row }) => row.original.scenario.label,
                header: 'Scenario',
                id: 'label',
                meta: { isRowHeader: true },
            },
            {
                cell: ({ row }) => (
                    <MonoCell>
                        {formatCurrency(row.original.scenario.riskPerTrade)}
                    </MonoCell>
                ),
                header: 'Risk $',
                id: 'risk',
            },
            {
                cell: ({ row }) => (
                    <MonoCell>
                        {formatPercent(row.original.scenario.winrate)}
                    </MonoCell>
                ),
                header: 'WR %',
                id: 'wr',
            },
            {
                cell: ({ row }) => (
                    <MonoCell>{row.original.scenario.rrRatio}</MonoCell>
                ),
                header: 'RR',
                id: 'rr',
            },
            {
                cell: ({ row }) => (
                    <MonoCell>{row.original.scenario.tradesPerDay}</MonoCell>
                ),
                header: 'Tr/day',
                id: 'tpd',
            },
            {
                cell: ({ row }) => (
                    <MonoCell>
                        {row.original.scenario.instrument ?? 'Not enforced'}
                    </MonoCell>
                ),
                header: 'Instrument',
                id: 'instrument',
            },
            ...(hasStopPoints
                ? [
                      {
                          cell: ({ row }) => {
                              const { stopPoints } = row.original.scenario;
                              return stopPoints === null ? (
                                  <MissingValue reason={NO_STOP_REASON} />
                              ) : (
                                  <MonoCell>{stopPoints}</MonoCell>
                              );
                          },
                          header: 'Stop pts',
                          id: 'stop-points',
                      } satisfies DataTableColumn<StrategyLabRow>,
                  ]
                : []),
            {
                cell: ({ row }) => (
                    <MonoCell>{row.original.scenario.accounts}</MonoCell>
                ),
                header: 'Accts',
                id: 'accts',
            },
            {
                cell: ({ row }) =>
                    CORRELATION_LABEL[row.original.scenario.correlation],
                header: 'Mode',
                id: 'mode',
            },
            ...(hasGroups
                ? [
                      {
                          cell: ({ row }) =>
                              row.original.scenario.correlation ===
                              CorrelationMode.Grouped ? (
                                  <MonoCell>
                                      {row.original.scenario.groups}
                                  </MonoCell>
                              ) : (
                                  <MissingValue reason={NO_GROUPS_REASON} />
                              ),
                          header: 'Groups',
                          id: 'groups',
                      } satisfies DataTableColumn<StrategyLabRow>,
                  ]
                : []),
            {
                cell: ({ row }) =>
                    describeDayStopRule(
                        row.original.scenario.dayStop,
                        DayStopRuleStyle.Compact,
                    ),
                header: 'Day-stop',
                id: 'day-stop',
            },
            {
                accessorFn: (r) => r.result?.perAccountPass ?? -1,
                cell: ({ row }) => (
                    <ResultCell
                        isComputing={row.original.isComputing}
                        value={row.original.result?.perAccountPass}
                    >
                        {(v) => formatPercent(v)}
                    </ResultCell>
                ),
                header: 'MC eval pass',
                id: 'mc-pass',
            },
            {
                accessorFn: (r) => r.result?.perAccountFundedSurvival ?? -1,
                cell: ({ row }) => (
                    <ResultCell
                        isComputing={row.original.isComputing}
                        value={row.original.result?.perAccountFundedSurvival}
                    >
                        {(v) => formatPercent(v)}
                    </ResultCell>
                ),
                header: 'MC survive',
                id: 'mc-survive',
            },
            {
                accessorFn: (r) => r.result?.theoreticalPassProb,
                cell: ({ row }) => <TheoCell row={row.original} />,
                header: 'Theo',
                id: 'theo',
                sortUndefined: 'last',
            },
            {
                accessorFn: (r) => r.result?.pAtLeast.k1 ?? -1,
                cell: ({ row }) => (
                    <ResultCell
                        isComputing={row.original.isComputing}
                        value={row.original.result?.pAtLeast.k1}
                    >
                        {(v) => formatPercent(v)}
                    </ResultCell>
                ),
                header: 'P(≥1)',
                id: 'p1',
            },
            {
                accessorFn: (r) => r.result?.pAtLeast.kHalf ?? -1,
                cell: ({ row }) => (
                    <ResultCell
                        isComputing={row.original.isComputing}
                        value={row.original.result?.pAtLeast.kHalf}
                    >
                        {(v) => formatPercent(v)}
                    </ResultCell>
                ),
                header: 'P(≥½)',
                id: 'phalf',
            },
            {
                accessorFn: (r) => r.result?.pAtLeast.kAll ?? -1,
                cell: ({ row }) => (
                    <ResultCell
                        isComputing={row.original.isComputing}
                        value={row.original.result?.pAtLeast.kAll}
                    >
                        {(v) => formatPercent(v)}
                    </ResultCell>
                ),
                header: 'P(all)',
                id: 'pall',
            },
            {
                accessorFn: (r) => r.result?.pAtLeastFundedSurvival.k1 ?? -1,
                cell: ({ row }) => (
                    <ResultCell
                        isComputing={row.original.isComputing}
                        value={row.original.result?.pAtLeastFundedSurvival.k1}
                    >
                        {(v) => formatPercent(v)}
                    </ResultCell>
                ),
                header: 'P(≥1 survive)',
                id: 'p1-survive',
            },
            {
                accessorFn: (r) => r.result?.pAtLeastFundedSurvival.kHalf ?? -1,
                cell: ({ row }) => (
                    <ResultCell
                        isComputing={row.original.isComputing}
                        value={
                            row.original.result?.pAtLeastFundedSurvival.kHalf
                        }
                    >
                        {(v) => formatPercent(v)}
                    </ResultCell>
                ),
                header: 'P(≥½ survive)',
                id: 'phalf-survive',
            },
            {
                accessorFn: (r) => r.result?.pAtLeastFundedSurvival.kAll ?? -1,
                cell: ({ row }) => (
                    <ResultCell
                        isComputing={row.original.isComputing}
                        value={row.original.result?.pAtLeastFundedSurvival.kAll}
                    >
                        {(v) => formatPercent(v)}
                    </ResultCell>
                ),
                header: 'P(all survive)',
                id: 'pall-survive',
            },
            {
                accessorFn: (r) => r.result?.expectedAccountsPass ?? -1,
                cell: ({ row }) => (
                    <ResultCell
                        isComputing={row.original.isComputing}
                        value={row.original.result?.expectedAccountsPass}
                    >
                        {(v) => v.toFixed(1)}
                    </ResultCell>
                ),
                header: 'E[#pass]',
                id: 'expected-pass',
            },
            {
                accessorFn: (r) => r.result?.expectedMonthlyNet ?? -Infinity,
                cell: ({ row }) => (
                    <ResultCell
                        isComputing={row.original.isComputing}
                        value={row.original.result?.expectedMonthlyNet}
                    >
                        {(v) => formatCompactCurrency(v)}
                    </ResultCell>
                ),
                header: 'E[$/mo]',
                id: 'monthly',
            },
            ...(isHazardPriced ? hazardColumns() : []),
            {
                accessorFn: (r) => r.result?.pHitDDLimit ?? -1,
                cell: ({ row }) => (
                    <ResultCell
                        isComputing={row.original.isComputing}
                        value={row.original.result?.pHitDDLimit}
                    >
                        {(v) => formatPercent(v)}
                    </ResultCell>
                ),
                header: 'Bust%',
                id: 'bust',
            },
            rowActionsColumn<StrategyLabRow>({
                actionsOf: ({ onlyOne, scenario }) => [
                    editRowAction(() => onEdit(scenario)),
                    {
                        confirm: {
                            confirmLabel: 'Remove',
                            description:
                                'The scenario and its results leave the lab.',
                            title: `Remove “${scenario.label}”?`,
                        },
                        icon: Trash2,
                        isDestructive: true,
                        isDisabled: onlyOne,
                        kind: RowActionKind.Select,
                        label: 'Remove',
                        onSelect: () => onRemove(scenario.id),
                    },
                ],
                labelOf: ({ scenario }) => scenario.label,
            }),
        ],
        [hasGroups, hasStopPoints, isHazardPriced, onEdit, onRemove],
    );

    return (
        <DataTable<StrategyLabRow>
            columns={columns}
            data={rows}
            isLoading={pending && rows.every((r) => !r.result)}
            pageSize={null}
            rowId={(r) => r.scenario.id}
            tableClassName={cn(
                'app-prop-calculator__strategy-lab-table',
                'text-xs tabular-nums',
            )}
        />
    );
}

function TheoCell({ row }: { row: StrategyLabRow }) {
    const { result } = row;
    if (result?.theoreticalPassReason !== undefined) {
        return (
            <MissingValue
                reason={
                    <p>{ECONOMICS_REASON_TEXT[result.theoreticalPassReason]}</p>
                }
            />
        );
    }
    return (
        <ResultCell
            className="text-muted-foreground"
            isComputing={row.isComputing}
            value={result?.theoreticalPassProb}
        >
            {(v) => formatPercent(v)}
        </ResultCell>
    );
}
