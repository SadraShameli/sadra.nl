'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { Tag } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '~/components/ui/Button';
import { Card, CardContent } from '~/components/ui/Card';
import { DataTable } from '~/components/ui/DataTable';
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
    type FirmId,
    type Plan,
    type PropFirm,
    serializePlanId,
    type SimInputs,
    type SimOutputs,
    simulate,
} from '~/lib/prop-calculator';
import { cn } from '~/lib/utils';

import { panelDescriptions } from './kpiDescriptions';
import { type PortfolioEntry } from './types';

interface PortfolioPanelProps {
    baseInputs: Omit<SimInputs, 'plan'>;
    currentFirm: PropFirm;
    currentPlan: Plan;
    firms: readonly PropFirm[];
    onPortfolioChange: (entries: PortfolioEntry[]) => void;
    portfolio: PortfolioEntry[];
}

interface PortfolioTableRow {
    entry: PortfolioEntry;
    firm: PropFirm;
    plan: Plan;
    sim: SimmedEntry | undefined;
}

interface SimmedEntry {
    entry: PortfolioEntry;
    out: SimOutputs;
}

export default function PortfolioPanel({
    baseInputs,
    currentFirm,
    currentPlan,
    firms,
    onPortfolioChange,
    portfolio,
}: PortfolioPanelProps) {
    const [simmed, setSimmed] = useState<SimmedEntry[]>([]);
    const [pending, setPending] = useState(false);

    const simKey = JSON.stringify({
        attempts: baseInputs.maxAttempts ?? 1,
        commission: baseInputs.commissionPerRoundTrip ?? 0,
        dayStop: baseInputs.dayStop,
        fundedHorizonDays: baseInputs.fundedHorizonDays,
        maxEvalDays: baseInputs.maxEvalDays,
        portfolio: portfolio.map((e) => ({
            actDiscount: e.activationDiscountPercent,
            count: e.count,
            evalDiscount: e.evalDiscountPercent,
            firmId: e.firmId,
            linkAct: e.linkActivationDiscount,
            planId: e.planId,
        })),
        risk: baseInputs.riskPerTrade,
        rr: baseInputs.rrRatio,
        seed: baseInputs.seed,
        tpd: baseInputs.tradesPerDay,
        trials: baseInputs.trials,
        winrate: baseInputs.winrate,
    });

    const [debouncedKey, setDebouncedKey] = useState(simKey);
    useEffect(() => {
        const t = setTimeout(() => setDebouncedKey(simKey), 600);
        return () => clearTimeout(t);
    }, [simKey]);

    const latest = useRef({ baseInputs, firms, portfolio });
    latest.current = { baseInputs, firms, portfolio };

    useEffect(() => {
        const { baseInputs, firms, portfolio } = latest.current;
        if (portfolio.length === 0) {
            setSimmed([]);
            setPending(false);
            return;
        }
        let cancelled = false;
        setPending(true);
        const handle = setTimeout(() => {
            const trials = Math.min(500, baseInputs.trials);
            const results: SimmedEntry[] = [];
            for (const entry of portfolio) {
                const firm = firms.find((f) => f.id === entry.firmId);
                const plan = firm?.findPlan(entry.planId);
                if (!plan) continue;
                const out = simulate({
                    ...baseInputs,
                    copyAccounts: 1,
                    discounts: {
                        activationPercent: entry.linkActivationDiscount
                            ? entry.evalDiscountPercent
                            : entry.activationDiscountPercent,
                        evalPercent: entry.evalDiscountPercent,
                    },
                    plan,
                    trials,
                });
                results.push({ entry, out });
            }
            if (!cancelled) {
                setSimmed(results);
                setPending(false);
            }
        }, 0);
        return () => {
            cancelled = true;
            clearTimeout(handle);
        };
    }, [debouncedKey]);

    const totals = useMemo(() => {
        if (simmed.length === 0) return null;
        const monthlyNet = simmed.reduce(
            (s, { entry, out }) => s + out.expectedMonthlyNet * entry.count,
            0,
        );
        const totalCost = simmed.reduce(
            (s, { entry, out }) => s + out.expectedTotalCost * entry.count,
            0,
        );
        const totalFunding = simmed.reduce(
            (s, { entry, out }) => s + out.accountSize * entry.count,
            0,
        );
        const totalAccounts = portfolio.reduce((s, e) => s + e.count, 0);
        const annualNet = monthlyNet * 12;
        const roi = totalCost > 0 ? annualNet / totalCost - 1 : 0;
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
                linkActivationDiscount: false,
                memory: {},
                planId: currentPlan.id,
            },
        ]);
    }

    function updateEntry(
        id: string,
        patch: Partial<Omit<PortfolioEntry, 'id'>>,
    ) {
        onPortfolioChange(
            portfolio.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        );
    }

    function removeEntry(id: string) {
        onPortfolioChange(portfolio.filter((e) => e.id !== id));
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
                    {pending && (
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
                                    body: 'Annualised return on your total evaluation spend. = (combined monthly net × 12) ÷ total eval cost − 1. Above 0 % means your expected payouts recover the full fee outlay within a year.',
                                    title: 'Annual ROI on fees',
                                }}
                                label="Annual ROI on fees"
                                positive={totals.roi > 0}
                                value={formatPercent(totals.roi)}
                            />
                        </div>
                    )}
                    <PortfolioTable
                        firms={firms}
                        onRemove={removeEntry}
                        onUpdate={updateEntry}
                        pending={pending}
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
    const atMin = row.entry.count <= 1;
    const atMax = row.entry.count >= maxAccounts;
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
                disabled={atMin}
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
                disabled={atMax}
                onClick={() => adjustCount(1)}
                size="sm"
                title={
                    atMax
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
    const hasCoupon = entry.evalDiscountPercent > 0 || effectiveActDiscount > 0;
    const evalAfter =
        plan.fees.oneTimeEval * (1 - entry.evalDiscountPercent / 100);
    const actAfter = plan.fees.activation * (1 - effectiveActDiscount / 100);
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
                                onChange={(e) =>
                                    onUpdate(entry.id, {
                                        evalDiscountPercent: Number(
                                            e.target.value,
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
                                    onChange={(e) =>
                                        onUpdate(entry.id, {
                                            activationDiscountPercent: Number(
                                                e.target.value,
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
                                onPressedChange={(v: boolean) =>
                                    onUpdate(entry.id, {
                                        linkActivationDiscount: v,
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
                    {hasCoupon && (
                        <Button
                            className="h-auto justify-start p-0 text-[11px] text-muted-foreground hover:text-foreground"
                            onClick={() =>
                                onUpdate(entry.id, {
                                    activationDiscountPercent: 0,
                                    evalDiscountPercent: 0,
                                    linkActivationDiscount: false,
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
    firm: PropFirm;
    firms: readonly PropFirm[];
    onUpdate: (id: string, patch: Partial<Omit<PortfolioEntry, 'id'>>) => void;
    row: PortfolioTableRow;
}) {
    function handleFirmChange(firmId: string) {
        const newFirm = firms.find((f) => f.id === (firmId as FirmId));
        const firstPlan = newFirm?.plans[0];
        if (!newFirm || !firstPlan) return;
        onUpdate(row.entry.id, {
            count: Math.min(
                row.entry.count,
                newFirm.maxFundedAccounts(firstPlan),
            ),
            firmId: firmId as FirmId,
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
    firm: PropFirm;
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
    onRemove,
    onUpdate,
    pending,
    portfolio,
    simmed,
    totals,
}: {
    firms: readonly PropFirm[];
    onRemove: (id: string) => void;
    onUpdate: (id: string, patch: Partial<Omit<PortfolioEntry, 'id'>>) => void;
    pending: boolean;
    portfolio: PortfolioEntry[];
    simmed: SimmedEntry[];
    totals: null | {
        monthlyNet: number;
        roi: number;
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

    const columns = useMemo<ColumnDef<PortfolioTableRow>[]>(
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
                    r.sim?.out.expectedMonthlyNet ?? Number.NEGATIVE_INFINITY,
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
                        {(out) => formatCurrency(out.expectedMonthlyNet)}
                    </ComputedCell>
                ),
                header: 'Net/acct',
                id: 'net',
            },
            {
                accessorFn: (r) =>
                    r.sim
                        ? r.sim.out.expectedMonthlyNet * r.entry.count
                        : Number.NEGATIVE_INFINITY,
                cell: ({ row }) => (
                    <ComputedCell
                        className="font-semibold text-foreground"
                        pending={pending}
                        sim={row.original.sim}
                    >
                        {(out) =>
                            formatCurrency(
                                out.expectedMonthlyNet *
                                    row.original.entry.count,
                            )
                        }
                    </ComputedCell>
                ),
                header: 'Combined net',
                id: 'combined',
            },
            {
                accessorFn: (r) => r.sim?.out.expectedTotalCost ?? Infinity,
                cell: ({ row }) => (
                    <ComputedCell
                        className="text-muted-foreground"
                        pending={pending}
                        sim={row.original.sim}
                    >
                        {(out) => formatCurrency(out.expectedTotalCost)}
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
        [firms, onRemove, onUpdate, pending],
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
                            colSpan={7}
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
