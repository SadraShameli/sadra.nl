'use client';

import { LayoutGrid, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { MissingValue } from '~/components/MissingValue';
import {
    editRowAction,
    RowActionKind,
    rowActionsColumn,
} from '~/components/RowActionsMenu';
import { StatStrip, type StatStripItem } from '~/components/StatStrip';
import { ToolPanel } from '~/components/ToolPanel';
import { Button } from '~/components/ui/button';
import { DataTable, type DataTableColumn } from '~/components/ui/data-table';
import { Dialog } from '~/components/ui/dialog';
import { EmptyState } from '~/components/ui/empty-state';
import { Skeleton } from '~/components/ui/skeleton';
import {
    formatCompactCurrency,
    formatCurrency,
    formatDays,
    formatOptionalPercent,
    formatPercent,
} from '~/lib/format';
import {
    annualisedRoiOnCost,
    type InstrumentSymbol,
    type Plan,
    type PlanOptIns,
    type Roi,
    ROI_BASIS_LABEL,
    RoiBasis,
    type SimInputs,
    type SimOutputs,
    simulate,
    type TradingFirm,
    withPlanOptIns,
} from '~/lib/prop-calculator';
import { cn } from '~/lib/utilities';

import { ComputationId } from './ComputationId';
import { toCouponDiscounts } from './couponDiscounts';
import { panelDescriptions } from './kpiDescriptions';
import { portfolioCacheKey } from './portfolioCacheKey';
import {
    hasCouponDiscount,
    PortfolioEntryDialog,
} from './PortfolioEntryDialog';
import { partitionBySizing, type SizingRefusal } from './simulationFailure';
import { SimulationFailureNotice } from './SimulationFailureNotice';
import { type PortfolioEntry } from './types';
import { useDebouncedComputation } from './useDebouncedSimulation';
import { ValueOrMissing } from './ValueOrMissing';

export interface SimmedEntry {
    entry: PortfolioEntry;
    out: SimOutputs;
}

interface PortfolioEntryEdit {
    entry: PortfolioEntry;
    isNew: boolean;
}

interface PortfolioPanelProperties {
    baseInputs: Omit<SimInputs, 'plan'>;
    currentFirm: TradingFirm;
    currentPlan: Plan;
    firms: readonly TradingFirm[];
    onPortfolioChange: (entries: PortfolioEntry[]) => void;
    planOptIns: PlanOptIns;
    portfolio: PortfolioEntry[];
}

interface PortfolioTableRow {
    entry: PortfolioEntry;
    firm: TradingFirm;
    isAwaitingResult: boolean;
    plan: Plan;
    sim: SimmedEntry | undefined;
}

interface SimulatableEntry {
    entry: PortfolioEntry;
    plan: Plan;
}

const DEBOUNCE_MS = 600;
const MAX_TRIALS = 500;
const EMPTY_SIMMED: SimmedEntry[] = [];
const NO_AWAITED_IDS: ReadonlySet<string> = new Set();
const NOT_SIMULATED_REASON =
    'This row was not simulated; the notice above the totals says why.';

export default function PortfolioPanel({
    baseInputs,
    currentFirm,
    currentPlan,
    firms,
    onPortfolioChange,
    planOptIns,
    portfolio,
}: PortfolioPanelProperties) {
    const key = portfolioCacheKey(baseInputs, portfolio, planOptIns);
    const sizing = partitionBySizing(portfolio, (entry) => ({
        ...baseInputs,
        ...entryPositionSizing(baseInputs, entry),
    }));
    const simulatable = simulatableEntries(firms, sizing.accepted);
    const computation = useDebouncedComputation(
        ComputationId.Planner,
        key,
        DEBOUNCE_MS,
        () => {
            const trials = Math.min(MAX_TRIALS, baseInputs.trials);
            const results: SimmedEntry[] = [];
            for (const { entry, plan } of simulatable) {
                const out = simulate({
                    ...baseInputs,
                    copyAccounts: entry.count,
                    discounts: toCouponDiscounts(entry),
                    ...entryPositionSizing(baseInputs, entry),
                    plan: withPlanOptIns(plan, planOptIns),
                    trials,
                });
                results.push({ entry, out });
            }
            return results;
        },
        EMPTY_SIMMED,
    );
    const isPending = portfolio.length > 0 && computation.pending;
    const simmed = portfolio.length === 0 ? EMPTY_SIMMED : computation.result;
    const awaitedIds =
        computation.error === null
            ? new Set(simulatable.map(({ entry }) => entry.id))
            : NO_AWAITED_IDS;

    const totals = useMemo(() => {
        if (simmed.length === 0) return null;
        const monthlyNet = simmed.reduce(
            (s, { out }) => s + out.expectedMonthlyNet,
            0,
        );
        const totalCost = simmed.reduce(
            (s, { out }) => s + out.expectedTotalCost,
            0,
        );
        const totalFunding = simmed.reduce(
            (s, { entry, out }) => s + out.accountSize * entry.count,
            0,
        );
        const totalAccounts = simmed.reduce(
            (s, { entry }) => s + entry.count,
            0,
        );
        const roi = annualisedRoiOnCost(monthlyNet, totalCost);
        return { monthlyNet, roi, totalAccounts, totalCost, totalFunding };
    }, [simmed]);

    const [editing, setEditing] = useState<null | PortfolioEntryEdit>(null);

    function saveEntry({ entry, isNew }: PortfolioEntryEdit) {
        onPortfolioChange(
            isNew
                ? [...portfolio, entry]
                : portfolio.map((current) =>
                      current.id === entry.id ? entry : current,
                  ),
        );
    }

    function removeEntry(id: string) {
        onPortfolioChange(portfolio.filter((entry) => entry.id !== id));
    }

    return (
        <ToolPanel
            actions={
                <>
                    {portfolio.length > 0 && (
                        <Button
                            className="h-7 px-2.5 text-xs text-muted-foreground"
                            onClick={() => onPortfolioChange([])}
                            size="sm"
                            type="button"
                            variant="outline"
                        >
                            Clear all
                        </Button>
                    )}
                    <Button
                        className="h-7 px-2.5 text-xs"
                        onClick={() =>
                            setEditing({
                                entry: {
                                    activationDiscountPercent: 0,
                                    count: 1,
                                    evalDiscountPercent: 0,
                                    firmId: currentFirm.id,
                                    id: crypto.randomUUID(),
                                    instrument: null,
                                    linkActivationDiscount: false,
                                    monthlySubscriptionDiscountPercent: 0,
                                    planId: currentPlan.id,
                                    resetDiscountPercent: 0,
                                    stopPoints: null,
                                },
                                isNew: true,
                            })
                        }
                        size="sm"
                        type="button"
                        variant="outline"
                    >
                        + Add firm
                    </Button>
                </>
            }
            className="app-prop-calculator__portfolio"
            info={panelDescriptions.portfolio}
            isComputing={isPending}
            title="Basket"
            titleAs="h3"
        >
            {portfolio.length === 0 ? (
                <EmptyState
                    description="Add firms to build a cross-firm portfolio and see combined expected monthly income."
                    icon={LayoutGrid}
                    title="No firms in the planner yet"
                />
            ) : (
                <div className="flex flex-col gap-4">
                    {sizing.refused.map((refusal) => (
                        <SimulationFailureNotice
                            key={refusal.item.id}
                            message={describeRefusedEntry(firms, refusal)}
                        />
                    ))}
                    <SimulationFailureNotice message={computation.error} />
                    {totals === null && !isPending ? null : (
                        <StatStrip
                            isLoading={totals === null}
                            items={[
                                {
                                    id: 'combined-monthly-net',
                                    info: (
                                        <p>
                                            Expected $ profit per month across
                                            all portfolio accounts after fees.
                                            Each row&apos;s expected monthly net
                                            × its account count, summed.
                                            Averaged over pass and bust
                                            outcomes.
                                        </p>
                                    ),
                                    label: 'Combined monthly net',
                                    value:
                                        totals === null
                                            ? null
                                            : formatCurrency(totals.monthlyNet),
                                },
                                {
                                    id: 'total-funding',
                                    info: (
                                        <p>
                                            Combined account capital across all
                                            portfolio rows. = sum of (account
                                            size × account count) for each row.
                                            Represents your total notional
                                            exposure across firms.
                                        </p>
                                    ),
                                    label: 'Total funding',
                                    value:
                                        totals === null
                                            ? null
                                            : formatCompactCurrency(
                                                  totals.totalFunding,
                                              ),
                                },
                                {
                                    id: 'total-eval-cost',
                                    info: (
                                        <p>
                                            Average all-in evaluation fees
                                            you&apos;ll pay per cycle across all
                                            accounts (eval, activation, monthly
                                            subs, and resets), weighted by
                                            account count. This is your expected
                                            outlay before any payout.
                                        </p>
                                    ),
                                    label: 'Total eval cost',
                                    value:
                                        totals === null
                                            ? null
                                            : formatCurrency(totals.totalCost),
                                },
                                {
                                    id: 'total-accounts',
                                    info: (
                                        <p>
                                            Sum of account counts across the
                                            simulated portfolio rows, the same
                                            rows as the net and cost totals: a
                                            row that is not simulated is not
                                            counted. Each row&apos;s count
                                            represents how many parallel funded
                                            accounts of that firm/plan you are
                                            running.
                                        </p>
                                    ),
                                    label: 'Total accounts',
                                    value:
                                        totals === null
                                            ? null
                                            : String(totals.totalAccounts),
                                },
                                portfolioRoiItem(totals?.roi ?? null),
                            ]}
                        />
                    )}
                    <PortfolioTable
                        awaitedIds={awaitedIds}
                        firms={firms}
                        globalInstrument={baseInputs.instrument ?? null}
                        globalStopPoints={baseInputs.stopPoints ?? null}
                        onEdit={(entry) => setEditing({ entry, isNew: false })}
                        onRemove={removeEntry}
                        pending={isPending}
                        portfolio={portfolio}
                        simmed={simmed}
                    />
                </div>
            )}
            <Dialog
                onOpenChange={(isOpen) => {
                    if (!isOpen) setEditing(null);
                }}
                open={editing !== null}
            >
                {editing !== null && (
                    <PortfolioEntryDialog
                        firms={firms}
                        globalStopPoints={baseInputs.stopPoints ?? null}
                        initial={editing.entry}
                        key={editing.entry.id}
                        onCancel={() => setEditing(null)}
                        onSubmit={(entry) => {
                            saveEntry({ entry, isNew: editing.isNew });
                            setEditing(null);
                        }}
                        submitLabel={editing.isNew ? 'Add' : 'Save'}
                        title={
                            editing.isNew ? 'Add firm' : 'Edit portfolio row'
                        }
                    />
                )}
            </Dialog>
        </ToolPanel>
    );
}

export function portfolioRoiItem(roi: null | Roi): StatStripItem {
    return {
        caption: 'monthly net × 12 ÷ total eval cost',
        id: 'portfolio-roi',
        info: (
            <p>
                Annualised net profit divided by total eval cost, expressed as a
                percentage. = (combined monthly net × 12) ÷ total eval cost.
                Above 0 % means the portfolio is expected to be net profitable
                over the year, after fees. Shows a dash when the total eval cost
                is $0, since a return on no outlay has no ratio.
            </p>
        ),
        isLoading: roi === null,
        label: ROI_BASIS_LABEL[roi?.basis ?? RoiBasis.AnnualisedOnCost],
        value:
            roi === null ? null : (
                <ValueOrMissing value={formatOptionalPercent(roi.value)} />
            ),
    };
}

function ComputedCell({
    children,
    className,
    row: { isAwaitingResult, sim },
}: {
    children: (out: SimOutputs) => React.ReactNode;
    className?: string;
    row: PortfolioTableRow;
}) {
    if (!sim) {
        return isAwaitingResult ? (
            <Skeleton className="h-4 w-12" />
        ) : (
            <MissingValue reason={NOT_SIMULATED_REASON} />
        );
    }
    return <span className={className}>{children(sim.out)}</span>;
}

function describePositionSizing(
    entry: PortfolioEntry,
    globalInstrument: InstrumentSymbol | null,
    globalStopPoints: null | number,
): string {
    const instrument = entry.instrument ?? globalInstrument;
    if (instrument === null) return 'Not enforced';
    const stopPoints = entry.stopPoints ?? globalStopPoints;
    const stop = stopPoints === null ? '' : ` @ ${stopPoints}pt`;
    const scope = entry.instrument === null ? ' (global)' : '';
    return `${instrument}${stop}${scope}`;
}

function describeRefusedEntry(
    firms: readonly TradingFirm[],
    refusal: SizingRefusal<PortfolioEntry>,
): string {
    const firm = firms.find((f) => f.id === refusal.item.firmId);
    const plan = firm?.findPlan(refusal.item.planId);
    const label = [firm?.displayName, plan?.label]
        .filter((part) => part !== undefined)
        .join(' ');
    return `Not simulated and left out of the totals, ${label}: ${refusal.issue}`;
}

function entryPositionSizing(
    baseInputs: Omit<SimInputs, 'plan'>,
    entry: PortfolioEntry,
): Pick<SimInputs, 'instrument' | 'stopPoints'> {
    return {
        instrument: entry.instrument ?? baseInputs.instrument,
        stopPoints: entry.stopPoints ?? baseInputs.stopPoints,
    };
}

function PortfolioTable({
    awaitedIds,
    firms,
    globalInstrument,
    globalStopPoints,
    onEdit,
    onRemove,
    pending,
    portfolio,
    simmed,
}: {
    awaitedIds: ReadonlySet<string>;
    firms: readonly TradingFirm[];
    globalInstrument: InstrumentSymbol | null;
    globalStopPoints: null | number;
    onEdit: (entry: PortfolioEntry) => void;
    onRemove: (id: string) => void;
    pending: boolean;
    portfolio: PortfolioEntry[];
    simmed: SimmedEntry[];
}) {
    const rows: PortfolioTableRow[] = useMemo(
        () =>
            portfolio
                .map((entry) => {
                    const firm =
                        firms.find((f) => f.id === entry.firmId) ?? firms[0];
                    if (!firm) return null;
                    const plan = firm.findPlan(entry.planId) ?? firm.plans[0];
                    if (!plan) return null;
                    const sim = simmed.find((s) => s.entry.id === entry.id);
                    return {
                        entry,
                        firm,
                        isAwaitingResult: awaitedIds.has(entry.id),
                        plan,
                        sim,
                    };
                })
                .filter((r): r is PortfolioTableRow => r !== null),
        [awaitedIds, portfolio, firms, simmed],
    );

    const columns = useMemo<DataTableColumn<PortfolioTableRow>[]>(
        () => [
            {
                cell: ({ row }) => row.original.firm.displayName,
                header: 'Firm',
                id: 'firm',
                meta: { isRowHeader: true },
            },
            {
                cell: ({ row }) => row.original.plan.label,
                header: 'Plan',
                id: 'plan',
            },
            {
                cell: ({ row }) => (
                    <span className="font-medium tabular-nums">
                        {row.original.entry.count}
                        <span className="text-muted-foreground">
                            {' / '}
                            {row.original.firm.maxFundedAccounts(
                                row.original.plan,
                            )}
                        </span>
                    </span>
                ),
                header: 'Accounts',
                id: 'accounts',
            },
            {
                cell: ({ row }) =>
                    hasCouponDiscount(row.original.entry) ? 'Applied' : 'None',
                header: 'Coupon',
                id: 'coupon',
            },
            {
                cell: ({ row }) =>
                    describePositionSizing(
                        row.original.entry,
                        globalInstrument,
                        globalStopPoints,
                    ),
                header: 'Sizing',
                id: 'sizing',
            },
            {
                accessorFn: (r) => r.sim?.out.evalPassProbability ?? -1,
                cell: ({ row }) => (
                    <ComputedCell row={row.original}>
                        {(out) => formatPercent(out.evalPassProbability)}
                    </ComputedCell>
                ),
                header: 'Eval pass',
                id: 'evalPass',
            },
            {
                accessorFn: (r) => r.sim?.out.fundedSurvivalProbability ?? -1,
                cell: ({ row }) => (
                    <ComputedCell row={row.original}>
                        {(out) => formatPercent(out.fundedSurvivalProbability)}
                    </ComputedCell>
                ),
                header: 'Funded survive',
                id: 'fundedSurvive',
            },
            {
                accessorFn: (r) => r.sim?.out.daysToPassP50 ?? Infinity,
                cell: ({ row }) => (
                    <ComputedCell row={row.original}>
                        {(out) => (
                            <ValueOrMissing
                                value={formatDays(out.daysToPassP50)}
                            />
                        )}
                    </ComputedCell>
                ),
                header: 'Days P50',
                id: 'days',
            },
            {
                accessorFn: (r) =>
                    r.sim
                        ? r.sim.out.expectedMonthlyNet / r.entry.count
                        : -Infinity,
                cell: ({ row }) => (
                    <ComputedCell row={row.original}>
                        {(out) =>
                            formatCurrency(
                                out.expectedMonthlyNet /
                                    row.original.entry.count,
                            )
                        }
                    </ComputedCell>
                ),
                header: 'Net/acct',
                id: 'net',
            },
            {
                accessorFn: (r) => r.sim?.out.expectedMonthlyNet ?? -Infinity,
                cell: ({ row }) => (
                    <ComputedCell
                        className="font-semibold text-foreground"
                        row={row.original}
                    >
                        {(out) => formatCurrency(out.expectedMonthlyNet)}
                    </ComputedCell>
                ),
                header: 'Combined net',
                id: 'combined',
            },
            {
                accessorFn: (r) =>
                    r.sim
                        ? r.sim.out.expectedTotalCost / r.entry.count
                        : Infinity,
                cell: ({ row }) => (
                    <ComputedCell
                        className="text-muted-foreground"
                        row={row.original}
                    >
                        {(out) =>
                            formatCurrency(
                                out.expectedTotalCost /
                                    row.original.entry.count,
                            )
                        }
                    </ComputedCell>
                ),
                header: 'Cost/acct',
                id: 'cost',
            },
            rowActionsColumn<PortfolioTableRow>({
                actionsOf: ({ entry, firm, plan }) => [
                    editRowAction(() =>
                        onEdit({
                            ...entry,
                            firmId: firm.id,
                            planId: plan.id,
                        }),
                    ),
                    {
                        confirm: {
                            confirmLabel: 'Remove',
                            description:
                                'The row leaves the planner and its totals.',
                            title: `Remove ${firm.displayName} ${plan.label}?`,
                        },
                        icon: Trash2,
                        isDestructive: true,
                        kind: RowActionKind.Select,
                        label: 'Remove',
                        onSelect: () => onRemove(entry.id),
                    },
                ],
                labelOf: ({ firm, plan }) =>
                    `${firm.displayName} ${plan.label}`,
            }),
        ],
        [globalInstrument, globalStopPoints, onEdit, onRemove],
    );

    return (
        <DataTable
            columns={columns}
            data={rows}
            isLoading={pending && simmed.length === 0}
            pageSize={null}
            rowId={(r) => r.entry.id}
            tableClassName={cn(
                'app-prop-calculator__portfolio-table',
                'text-xs tabular-nums',
            )}
        />
    );
}

function simulatableEntries(
    firms: readonly TradingFirm[],
    accepted: readonly PortfolioEntry[],
): SimulatableEntry[] {
    const simulatable: SimulatableEntry[] = [];
    for (const entry of accepted) {
        const plan = firms
            .find((f) => f.id === entry.firmId)
            ?.findPlan(entry.planId);
        if (plan !== undefined) simulatable.push({ entry, plan });
    }
    return simulatable;
}
