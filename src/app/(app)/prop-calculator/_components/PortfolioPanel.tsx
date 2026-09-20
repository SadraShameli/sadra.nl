'use client';

import { Tag } from 'lucide-react';
import { useMemo } from 'react';

import { Button } from '~/components/ui/Button';
import { Card, CardContent } from '~/components/ui/Card';
import { DataTable, type DataTableColumn } from '~/components/ui/DataTable';
import InfoPopover from '~/components/ui/InfoPopover';
import { Input } from '~/components/ui/Input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '~/components/ui/Popover';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
import { Skeleton } from '~/components/ui/Skeleton';
import { TableCell, TableRow } from '~/components/ui/Table';
import { Toggle } from '~/components/ui/Toggle';
import {
    formatCompactCurrency,
    formatCurrency,
    formatDays,
    formatPercent,
} from '~/lib/format';
import {
    ALL_INSTRUMENTS,
    annualisedRoiOnCost,
    type InstrumentSymbol,
    parseFirmId,
    percent,
    type Plan,
    type Roi,
    serializePlanId,
    type SimInputs,
    type SimOutputs,
    simulate,
    type TradingFirm,
} from '~/lib/prop-calculator';
import { cn } from '~/lib/utilities';

import { panelDescriptions } from './kpiDescriptions';
import { type PortfolioEntry } from './types';
import { useDebouncedComputation } from './useDebouncedSimulation';

interface PortfolioPanelProperties {
    baseInputs: Omit<SimInputs, 'plan'>;
    currentFirm: TradingFirm;
    currentPlan: Plan;
    firms: readonly TradingFirm[];
    onPortfolioChange: (entries: PortfolioEntry[]) => void;
    portfolio: PortfolioEntry[];
}

interface PortfolioTableRow {
    entry: PortfolioEntry;
    firm: TradingFirm;
    plan: Plan;
    sim: SimmedEntry | undefined;
}

interface SimmedEntry {
    entry: PortfolioEntry;
    out: SimOutputs;
}

const DEBOUNCE_MS = 600;
const MAX_TRIALS = 500;
const EMPTY_SIMMED: SimmedEntry[] = [];

export default function PortfolioPanel({
    baseInputs,
    currentFirm,
    currentPlan,
    firms,
    onPortfolioChange,
    portfolio,
}: PortfolioPanelProperties) {
    const key = buildCacheKey(baseInputs, portfolio);
    const computation = useDebouncedComputation<SimmedEntry[]>(
        key,
        DEBOUNCE_MS,
        () => {
            const trials = Math.min(MAX_TRIALS, baseInputs.trials);
            const results: SimmedEntry[] = [];
            for (const entry of portfolio) {
                const firm = firms.find((f) => f.id === entry.firmId);
                const plan = firm?.findPlan(entry.planId);
                if (!plan) continue;
                const out = simulate({
                    ...baseInputs,
                    copyAccounts: entry.count,
                    discounts: {
                        activationPercent: percent(
                            entry.linkActivationDiscount
                                ? entry.evalDiscountPercent
                                : entry.activationDiscountPercent,
                        ),
                        evalPercent: percent(entry.evalDiscountPercent),
                        monthlySubscriptionPercent: percent(
                            entry.monthlySubscriptionDiscountPercent,
                        ),
                        resetPercent: percent(entry.resetDiscountPercent),
                    },
                    instrument: entry.instrument ?? baseInputs.instrument,
                    plan,
                    stopPoints: entry.stopPoints ?? baseInputs.stopPoints,
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
        const totalAccounts = portfolio.reduce(
            (s, entry) => s + entry.count,
            0,
        );
        const roi = annualisedRoiOnCost(monthlyNet, totalCost);
        return { monthlyNet, roi, totalAccounts, totalCost, totalFunding };
    }, [simmed, portfolio]);

    function addEntry() {
        onPortfolioChange([
            ...portfolio,
            {
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
        ]);
    }

    function updateEntry(
        id: string,
        patch: Partial<Omit<PortfolioEntry, 'id'>>,
    ) {
        onPortfolioChange(
            portfolio.map((entry) =>
                entry.id === id ? { ...entry, ...patch } : entry,
            ),
        );
    }

    function removeEntry(id: string) {
        onPortfolioChange(portfolio.filter((entry) => entry.id !== id));
    }

    return (
        <Card className={cn('app-prop-calculator__portfolio', 'px-5 py-4')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">
                        Multi-firm portfolio
                    </h3>
                    <InfoPopover title="Multi-firm portfolio">
                        {panelDescriptions.portfolio}
                    </InfoPopover>
                </div>
                <div className="flex items-center gap-3">
                    {isPending && (
                        <span className="text-xs text-muted-foreground">
                            computing…
                        </span>
                    )}
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
                        onClick={addEntry}
                        size="sm"
                        type="button"
                        variant="outline"
                    >
                        + Add firm
                    </Button>
                </div>
            </div>

            {portfolio.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                    Add firms to build a cross-firm portfolio and see combined
                    expected monthly income.
                </p>
            ) : (
                <div className="flex flex-col gap-4">
                    {totals && (
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
                            <SummaryCard
                                info={{
                                    body: "Expected $ profit per month across all portfolio accounts after fees. Each row's expected monthly net × its account count, summed. Averaged over pass and bust outcomes.",
                                    title: 'Combined monthly net',
                                }}
                                label="Combined monthly net"
                                positive={totals.monthlyNet > 0}
                                value={formatCurrency(totals.monthlyNet)}
                            />
                            <SummaryCard
                                info={{
                                    body: 'Combined account capital across all portfolio rows. = sum of (account size × account count) for each row. Represents your total notional exposure across firms.',
                                    title: 'Total funding',
                                }}
                                label="Total funding"
                                value={formatCompactCurrency(
                                    totals.totalFunding,
                                )}
                            />
                            <SummaryCard
                                info={{
                                    body: "Average all-in evaluation fees you'll pay per cycle across all accounts — eval, activation, monthly subs, and resets — weighted by account count. This is your expected outlay before any payout.",
                                    title: 'Total eval cost',
                                }}
                                label="Total eval cost"
                                value={formatCurrency(totals.totalCost)}
                            />
                            <SummaryCard
                                info={{
                                    body: "Sum of account counts across all portfolio rows. Each row's count represents how many parallel funded accounts of that firm/plan you are running.",
                                    title: 'Total accounts',
                                }}
                                label="Total accounts"
                                value={String(totals.totalAccounts)}
                            />
                            <SummaryCard
                                info={{
                                    body: 'Annualised net profit divided by total eval cost, expressed as a percentage. = (combined monthly net × 12) ÷ total eval cost. Above 0 % means the portfolio is expected to be net profitable over the year, after fees.',
                                    title: 'Annual ROI on fees',
                                }}
                                label="Annual ROI on fees"
                                positive={totals.roi.value > 0}
                                value={formatPercent(totals.roi.value)}
                            />
                        </div>
                    )}
                    <PortfolioTable
                        firms={firms}
                        globalInstrument={baseInputs.instrument ?? null}
                        globalStopPoints={baseInputs.stopPoints ?? null}
                        onRemove={removeEntry}
                        onUpdate={updateEntry}
                        pending={isPending}
                        portfolio={portfolio}
                        simmed={simmed}
                        totals={totals}
                    />
                </div>
            )}
        </Card>
    );
}

function AccountsCell({
    onUpdate,
    row,
}: {
    onUpdate: (id: string, patch: Partial<Omit<PortfolioEntry, 'id'>>) => void;
    row: PortfolioTableRow;
}) {
    const maxAccounts = row.firm.maxFundedAccounts(row.plan);
    const isAtMin = row.entry.count <= 1;
    const isAtMax = row.entry.count >= maxAccounts;
    function adjustCount(delta: number) {
        onUpdate(row.entry.id, {
            count: Math.max(1, Math.min(maxAccounts, row.entry.count + delta)),
        });
    }
    return (
        <div className="flex items-center gap-1">
            <Button
                aria-label="Decrease accounts"
                className="size-5 p-0 text-muted-foreground"
                disabled={isAtMin}
                onClick={() => adjustCount(-1)}
                size="sm"
                type="button"
                variant="ghost"
            >
                −
            </Button>
            <span className="min-w-12 text-center font-medium tabular-nums">
                {row.entry.count}
                <span className="text-muted-foreground">
                    {' / '}
                    {maxAccounts}
                </span>
            </span>
            <Button
                aria-label="Increase accounts"
                className="size-5 p-0 text-muted-foreground"
                disabled={isAtMax}
                onClick={() => adjustCount(1)}
                size="sm"
                title={
                    isAtMax
                        ? `${row.firm.displayName} caps at ${maxAccounts}`
                        : undefined
                }
                type="button"
                variant="ghost"
            >
                +
            </Button>
        </div>
    );
}

function buildCacheKey(
    baseInputs: Omit<SimInputs, 'plan'>,
    portfolio: PortfolioEntry[],
): string {
    return JSON.stringify({
        attempts: baseInputs.maxAttempts ?? 1,
        commission: baseInputs.commissionPerRoundTrip ?? 0,
        dayStop: baseInputs.dayStop,
        evalDayPolicy: baseInputs.evalDayPolicy ?? null,
        fundedHorizonDays: baseInputs.fundedHorizonDays,
        idleDayProbability: baseInputs.idleDayProbability ?? 0,
        instrument: baseInputs.instrument ?? null,
        maxEvalDays: baseInputs.maxEvalDays,
        minRetainedCushion: baseInputs.minRetainedCushion ?? null,
        payoutRequestSize: baseInputs.payoutRequestSize ?? null,
        portfolio: portfolio.map((entry) => ({
            actDiscount: entry.activationDiscountPercent,
            count: entry.count,
            evalDiscount: entry.evalDiscountPercent,
            firmId: entry.firmId,
            instrument: entry.instrument,
            linkAct: entry.linkActivationDiscount,
            msubDiscount: entry.monthlySubscriptionDiscountPercent,
            planId: entry.planId,
            resetDiscount: entry.resetDiscountPercent,
            stopPoints: entry.stopPoints,
        })),
        risk: baseInputs.riskPerTrade,
        rr: baseInputs.rrRatio,
        rungSizing: baseInputs.rungSizing ?? null,
        seed: baseInputs.seed,
        stopPoints: baseInputs.stopPoints ?? null,
        tpd: baseInputs.tradesPerDay,
        trials: baseInputs.trials,
        winrate: baseInputs.winrate,
    });
}

function ComputedCell({
    children,
    className,
    pending,
    sim,
}: {
    children: (out: SimOutputs) => React.ReactNode;
    className?: string;
    pending: boolean;
    sim: SimmedEntry | undefined;
}) {
    if (!sim) {
        return pending ? (
            <Skeleton className="h-4 w-12" />
        ) : (
            <span className="text-muted-foreground">—</span>
        );
    }
    return <span className={className}>{children(sim.out)}</span>;
}

function CouponCell({
    onUpdate,
    row,
}: {
    onUpdate: (id: string, patch: Partial<Omit<PortfolioEntry, 'id'>>) => void;
    row: PortfolioTableRow;
}) {
    const { entry, plan } = row;
    const effectiveActDiscount = entry.linkActivationDiscount
        ? entry.evalDiscountPercent
        : entry.activationDiscountPercent;
    const hasCoupon =
        entry.evalDiscountPercent > 0 ||
        effectiveActDiscount > 0 ||
        entry.monthlySubscriptionDiscountPercent > 0 ||
        entry.resetDiscountPercent > 0;
    const evalAfter =
        plan.fees.oneTimeEval * (1 - entry.evalDiscountPercent / 100);
    const actAfter = plan.fees.activation * (1 - effectiveActDiscount / 100);
    const monthlySubscriptionAfter =
        plan.fees.monthlySubscription *
        (1 - entry.monthlySubscriptionDiscountPercent / 100);
    const resetAfter = plan.fees.reset * (1 - entry.resetDiscountPercent / 100);
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    className="h-6 gap-1 px-2 text-[11px]"
                    size="sm"
                    variant={hasCoupon ? 'secondary' : 'outline'}
                >
                    <Tag className="size-3" />
                    {hasCoupon ? 'Applied' : 'Coupon'}
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80">
                <div className="flex flex-col gap-3">
                    <p className="text-xs font-semibold">Coupon discounts</p>
                    <div>
                        <div className="mb-1 flex items-center justify-between">
                            <label
                                className="text-xs text-muted-foreground"
                                htmlFor={`eval-discount-${entry.id}`}
                            >
                                Eval fee discount
                            </label>
                            {plan.fees.oneTimeEval > 0 && (
                                <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                                    {entry.evalDiscountPercent > 0
                                        ? `${formatCompactCurrency(plan.fees.oneTimeEval)} → ${formatCompactCurrency(evalAfter)}`
                                        : formatCompactCurrency(
                                              plan.fees.oneTimeEval,
                                          )}
                                </span>
                            )}
                        </div>
                        <div className="relative">
                            <Input
                                className="pr-7"
                                disabled={plan.fees.oneTimeEval === 0}
                                id={`eval-discount-${entry.id}`}
                                max={100}
                                min={0}
                                onChange={(event) =>
                                    onUpdate(entry.id, {
                                        evalDiscountPercent: Number(
                                            event.target.value,
                                        ),
                                    })
                                }
                                step={1}
                                type="number"
                                value={entry.evalDiscountPercent || ''}
                            />
                            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                                %
                            </span>
                        </div>
                    </div>
                    <div>
                        <div className="mb-1 flex items-center justify-between">
                            <label
                                className="text-xs text-muted-foreground"
                                htmlFor={`activation-discount-${entry.id}`}
                            >
                                Activation fee discount
                            </label>
                            {plan.fees.activation > 0 && (
                                <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                                    {effectiveActDiscount > 0
                                        ? `${formatCompactCurrency(plan.fees.activation)} → ${formatCompactCurrency(actAfter)}`
                                        : formatCompactCurrency(
                                              plan.fees.activation,
                                          )}
                                </span>
                            )}
                        </div>
                        <div className="flex items-stretch gap-2">
                            <div className="relative flex-1">
                                <Input
                                    className="pr-7"
                                    disabled={
                                        plan.fees.activation === 0 ||
                                        entry.linkActivationDiscount
                                    }
                                    id={`activation-discount-${entry.id}`}
                                    max={100}
                                    min={0}
                                    onChange={(event) =>
                                        onUpdate(entry.id, {
                                            activationDiscountPercent: Number(
                                                event.target.value,
                                            ),
                                        })
                                    }
                                    step={1}
                                    type="number"
                                    value={
                                        (entry.linkActivationDiscount
                                            ? entry.evalDiscountPercent
                                            : entry.activationDiscountPercent) ||
                                        ''
                                    }
                                />
                                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                                    %
                                </span>
                            </div>
                            <Toggle
                                className="text-xs whitespace-nowrap"
                                disabled={plan.fees.activation === 0}
                                onPressedChange={(isLinked: boolean) =>
                                    onUpdate(entry.id, {
                                        linkActivationDiscount: isLinked,
                                    })
                                }
                                pressed={entry.linkActivationDiscount}
                                size="sm"
                                variant="outline"
                            >
                                Match eval
                            </Toggle>
                        </div>
                    </div>
                    <div>
                        <div className="mb-1 flex items-center justify-between">
                            <label
                                className="text-xs text-muted-foreground"
                                htmlFor={`monthly-subscription-discount-${entry.id}`}
                            >
                                Monthly subscription discount
                            </label>
                            {plan.fees.monthlySubscription > 0 && (
                                <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                                    {entry.monthlySubscriptionDiscountPercent >
                                    0
                                        ? `${formatCompactCurrency(plan.fees.monthlySubscription)} → ${formatCompactCurrency(monthlySubscriptionAfter)}`
                                        : formatCompactCurrency(
                                              plan.fees.monthlySubscription,
                                          )}
                                </span>
                            )}
                        </div>
                        <div className="relative">
                            <Input
                                className="pr-7"
                                disabled={plan.fees.monthlySubscription === 0}
                                id={`monthly-subscription-discount-${entry.id}`}
                                max={100}
                                min={0}
                                onChange={(event) =>
                                    onUpdate(entry.id, {
                                        monthlySubscriptionDiscountPercent:
                                            Number(event.target.value),
                                    })
                                }
                                step={1}
                                type="number"
                                value={
                                    entry.monthlySubscriptionDiscountPercent ||
                                    ''
                                }
                            />
                            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                                %
                            </span>
                        </div>
                    </div>
                    <div>
                        <div className="mb-1 flex items-center justify-between">
                            <label
                                className="text-xs text-muted-foreground"
                                htmlFor={`reset-discount-${entry.id}`}
                            >
                                Reset fee discount
                            </label>
                            {plan.fees.reset > 0 && (
                                <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                                    {entry.resetDiscountPercent > 0
                                        ? `${formatCompactCurrency(plan.fees.reset)} → ${formatCompactCurrency(resetAfter)}`
                                        : formatCompactCurrency(
                                              plan.fees.reset,
                                          )}
                                </span>
                            )}
                        </div>
                        <div className="relative">
                            <Input
                                className="pr-7"
                                disabled={plan.fees.reset === 0}
                                id={`reset-discount-${entry.id}`}
                                max={100}
                                min={0}
                                onChange={(event) =>
                                    onUpdate(entry.id, {
                                        resetDiscountPercent: Number(
                                            event.target.value,
                                        ),
                                    })
                                }
                                step={1}
                                type="number"
                                value={entry.resetDiscountPercent || ''}
                            />
                            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                                %
                            </span>
                        </div>
                    </div>
                    {hasCoupon && (
                        <Button
                            className="h-auto justify-start p-0 text-[11px] text-muted-foreground hover:text-foreground"
                            onClick={() =>
                                onUpdate(entry.id, {
                                    activationDiscountPercent: 0,
                                    evalDiscountPercent: 0,
                                    linkActivationDiscount: false,
                                    monthlySubscriptionDiscountPercent: 0,
                                    resetDiscountPercent: 0,
                                })
                            }
                            size="sm"
                            type="button"
                            variant="ghost"
                        >
                            Reset discounts
                        </Button>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}

function FirmCell({
    firm,
    firms,
    onUpdate,
    row,
}: {
    firm: TradingFirm;
    firms: readonly TradingFirm[];
    onUpdate: (id: string, patch: Partial<Omit<PortfolioEntry, 'id'>>) => void;
    row: PortfolioTableRow;
}) {
    function handleFirmChange(rawFirmId: string) {
        const firmId = parseFirmId(rawFirmId);
        const newFirm = firms.find((f) => f.id === firmId);
        const firstPlan = newFirm?.plans[0];
        if (!newFirm || !firmId || !firstPlan) return;
        onUpdate(row.entry.id, {
            count: Math.min(
                row.entry.count,
                newFirm.maxFundedAccounts(firstPlan),
            ),
            firmId,
            planId: firstPlan.id,
        });
    }
    return (
        <Select onValueChange={handleFirmChange} value={firm.id}>
            <SelectTrigger className="h-7 w-44 text-xs">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {firms.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                        {f.displayName}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

function PlanCell({
    firm,
    onUpdate,
    plan,
    row,
}: {
    firm: TradingFirm;
    onUpdate: (id: string, patch: Partial<Omit<PortfolioEntry, 'id'>>) => void;
    plan: Plan;
    row: PortfolioTableRow;
}) {
    function handlePlanChange(serialized: string) {
        const found = firm.plans.find(
            (p) => serializePlanId(p.id) === serialized,
        );
        if (!found) return;
        onUpdate(row.entry.id, {
            count: Math.min(row.entry.count, firm.maxFundedAccounts(found)),
            planId: found.id,
        });
    }
    return (
        <Select
            onValueChange={handlePlanChange}
            value={serializePlanId(plan.id)}
        >
            <SelectTrigger className="h-7 w-44 text-xs">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {firm.plans.map((p) => (
                    <SelectItem
                        key={serializePlanId(p.id)}
                        value={serializePlanId(p.id)}
                    >
                        {p.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

function PortfolioTable({
    firms,
    globalInstrument,
    globalStopPoints,
    onRemove,
    onUpdate,
    pending,
    portfolio,
    simmed,
    totals,
}: {
    firms: readonly TradingFirm[];
    globalInstrument: InstrumentSymbol | null;
    globalStopPoints: null | number;
    onRemove: (id: string) => void;
    onUpdate: (id: string, patch: Partial<Omit<PortfolioEntry, 'id'>>) => void;
    pending: boolean;
    portfolio: PortfolioEntry[];
    simmed: SimmedEntry[];
    totals: null | {
        monthlyNet: number;
        roi: Roi;
        totalAccounts: number;
        totalCost: number;
        totalFunding: number;
    };
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
                    return { entry, firm, plan, sim };
                })
                .filter((r): r is PortfolioTableRow => r !== null),
        [portfolio, firms, simmed],
    );

    const columns = useMemo<DataTableColumn<PortfolioTableRow>[]>(
        () => [
            {
                cell: ({ row }) => (
                    <FirmCell
                        firm={row.original.firm}
                        firms={firms}
                        onUpdate={onUpdate}
                        row={row.original}
                    />
                ),
                header: 'Firm',
                id: 'firm',
            },
            {
                cell: ({ row }) => (
                    <PlanCell
                        firm={row.original.firm}
                        onUpdate={onUpdate}
                        plan={row.original.plan}
                        row={row.original}
                    />
                ),
                header: 'Plan',
                id: 'plan',
            },
            {
                cell: ({ row }) => (
                    <AccountsCell onUpdate={onUpdate} row={row.original} />
                ),
                header: 'Accounts',
                id: 'accounts',
            },
            {
                cell: ({ row }) => (
                    <CouponCell onUpdate={onUpdate} row={row.original} />
                ),
                header: 'Coupon',
                id: 'coupon',
            },
            {
                cell: ({ row }) => (
                    <PositionSizingCell
                        globalInstrument={globalInstrument}
                        globalStopPoints={globalStopPoints}
                        onUpdate={onUpdate}
                        row={row.original}
                    />
                ),
                header: 'Sizing',
                id: 'sizing',
            },
            {
                accessorFn: (r) => r.sim?.out.passProbability ?? -1,
                cell: ({ row }) => (
                    <ComputedCell pending={pending} sim={row.original.sim}>
                        {(out) => formatPercent(out.passProbability)}
                    </ComputedCell>
                ),
                header: 'Pass%',
                id: 'pass',
            },
            {
                accessorFn: (r) => r.sim?.out.daysToPassP50 ?? Infinity,
                cell: ({ row }) => (
                    <ComputedCell pending={pending} sim={row.original.sim}>
                        {(out) => formatDays(out.daysToPassP50)}
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
                    <ComputedCell
                        className={
                            row.original.sim
                                ? row.original.sim.out.expectedMonthlyNet >= 0
                                    ? 'text-emerald-400'
                                    : 'text-rose-400'
                                : undefined
                        }
                        pending={pending}
                        sim={row.original.sim}
                    >
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
                        pending={pending}
                        sim={row.original.sim}
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
                        pending={pending}
                        sim={row.original.sim}
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
            {
                cell: ({ row }) => (
                    <Button
                        aria-label="Remove"
                        className="size-6 p-0 text-muted-foreground"
                        onClick={() => onRemove(row.original.entry.id)}
                        size="sm"
                        type="button"
                        variant="ghost"
                    >
                        ×
                    </Button>
                ),
                header: () => <span className="sr-only">Actions</span>,
                id: 'remove',
            },
        ],
        [
            firms,
            globalInstrument,
            globalStopPoints,
            onRemove,
            onUpdate,
            pending,
        ],
    );

    return (
        <DataTable
            columns={columns}
            data={rows}
            footer={
                totals && simmed.length > 1 ? (
                    <TableRow className="font-semibold text-foreground">
                        <TableCell
                            className="text-muted-foreground"
                            colSpan={8}
                        >
                            Total ({totals.totalAccounts} accounts)
                        </TableCell>
                        <TableCell>
                            {formatCurrency(totals.monthlyNet)}
                        </TableCell>
                        <TableCell>
                            {formatCurrency(totals.totalCost)}
                        </TableCell>
                        <TableCell />
                    </TableRow>
                ) : undefined
            }
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

function PositionSizingCell({
    globalInstrument,
    globalStopPoints,
    onUpdate,
    row,
}: {
    globalInstrument: InstrumentSymbol | null;
    globalStopPoints: null | number;
    onUpdate: (id: string, patch: Partial<Omit<PortfolioEntry, 'id'>>) => void;
    row: PortfolioTableRow;
}) {
    const { entry } = row;
    const hasOverride = entry.instrument !== null;
    const effectiveInstrument = entry.instrument ?? globalInstrument;
    const effectiveStopPoints = entry.stopPoints ?? globalStopPoints;
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    className="h-6 gap-1 px-2 text-[11px]"
                    size="sm"
                    variant={hasOverride ? 'secondary' : 'outline'}
                >
                    {effectiveInstrument === null
                        ? 'Not enforced'
                        : `${effectiveInstrument}${
                              effectiveStopPoints === null
                                  ? ''
                                  : ` @ ${effectiveStopPoints}pt`
                          }${hasOverride ? '' : ' (global)'}`}
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64">
                <div className="flex flex-col gap-3">
                    <p className="text-xs font-semibold">
                        Contract-limit sizing
                    </p>
                    <div>
                        <label
                            className="mb-1 block text-xs text-muted-foreground"
                            htmlFor={`sizing-instrument-${entry.id}`}
                        >
                            Instrument
                        </label>
                        <Select
                            onValueChange={(v) =>
                                onUpdate(entry.id, {
                                    instrument:
                                        v === 'global'
                                            ? null
                                            : (v as InstrumentSymbol),
                                })
                            }
                            value={entry.instrument ?? 'global'}
                        >
                            <SelectTrigger
                                className="h-7 w-full text-xs"
                                id={`sizing-instrument-${entry.id}`}
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="global">
                                    Use global setting
                                </SelectItem>
                                {ALL_INSTRUMENTS.map((spec) => (
                                    <SelectItem
                                        key={spec.symbol}
                                        value={spec.symbol}
                                    >
                                        {spec.symbol}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {hasOverride && (
                        <div>
                            <label
                                className="mb-1 block text-xs text-muted-foreground"
                                htmlFor={`sizing-stop-${entry.id}`}
                            >
                                Stop distance (points)
                            </label>
                            <Input
                                id={`sizing-stop-${entry.id}`}
                                min={0.25}
                                onChange={(event) => {
                                    const n = Number(event.target.value);
                                    if (Number.isFinite(n) && n > 0)
                                        onUpdate(entry.id, {
                                            stopPoints: n,
                                        });
                                }}
                                step={0.25}
                                type="number"
                                value={entry.stopPoints ?? ''}
                            />
                        </div>
                    )}
                    {hasOverride && (
                        <Button
                            className="h-auto justify-start p-0 text-[11px] text-muted-foreground hover:text-foreground"
                            onClick={() =>
                                onUpdate(entry.id, {
                                    instrument: null,
                                    stopPoints: null,
                                })
                            }
                            size="sm"
                            type="button"
                            variant="ghost"
                        >
                            Use global setting
                        </Button>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}

function SummaryCard({
    info,
    label,
    positive,
    value,
}: {
    info?: { body: string; title: string };
    label: string;
    positive?: boolean;
    value: string;
}) {
    return (
        <Card className="gap-1 py-2">
            <CardContent className="px-3">
                <div className="flex items-center gap-1">
                    <p className="text-[10px] text-muted-foreground">{label}</p>
                    {info && (
                        <InfoPopover title={info.title}>
                            <p>{info.body}</p>
                        </InfoPopover>
                    )}
                </div>
                <p
                    className={cn(
                        'font-mono text-sm font-semibold',
                        positive === true
                            ? 'text-emerald-400'
                            : positive === false
                              ? 'text-rose-400'
                              : 'text-foreground',
                    )}
                >
                    {value}
                </p>
            </CardContent>
        </Card>
    );
}
