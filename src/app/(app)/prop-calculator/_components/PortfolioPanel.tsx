'use client';

import { Tag } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';

import {
    serializePlanId,
    simulate,
    type FirmId,
    type Plan,
    type PropFirm,
    type SimInputs,
    type SimOutputs,
} from '~/lib/prop-calculator';
import { cn } from '~/lib/utils';

import { Card } from '~/components/ui/Card';
import { Input } from '~/components/ui/Input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '~/components/ui/Popover';
import { Select } from '~/components/ui/Select';

import {
    formatCompactCurrency,
    formatCurrency,
    formatDays,
    formatPercent,
} from './helpers';
import InfoPopover from './InfoPopover';
import { panelDescriptions } from './kpiDescriptions';
import { type PortfolioEntry } from './types';

interface SimmedEntry {
    entry: PortfolioEntry;
    out: SimOutputs;
}

interface PortfolioPanelProps {
    firms: readonly PropFirm[];
    baseInputs: Omit<SimInputs, 'plan'>;
    currentFirm: PropFirm;
    currentPlan: Plan;
    portfolio: PortfolioEntry[];
    onPortfolioChange: (entries: PortfolioEntry[]) => void;
}

export default function PortfolioPanel({
    firms,
    baseInputs,
    currentFirm,
    currentPlan,
    portfolio,
    onPortfolioChange,
}: PortfolioPanelProps) {
    const [simmed, setSimmed] = useState<SimmedEntry[]>([]);
    const [pending, setPending] = useState(false);

    const simKey = JSON.stringify({
        portfolio: portfolio.map((e) => ({
            firmId: e.firmId,
            planId: e.planId,
            count: e.count,
            evalDiscount: e.evalDiscountPercent,
            actDiscount: e.activationDiscountPercent,
            linkAct: e.linkActivationDiscount,
        })),
        winrate: baseInputs.winrate,
        rr: baseInputs.rrRatio,
        risk: baseInputs.riskPerTrade,
        tpd: baseInputs.tradesPerDay,
        seed: baseInputs.seed,
        commission: baseInputs.commissionPerRoundTrip ?? 0,
        maxEvalDays: baseInputs.maxEvalDays,
        fundedHorizonDays: baseInputs.fundedHorizonDays,
        attempts: baseInputs.maxAttempts ?? 1,
        trials: baseInputs.trials,
        dayStop: baseInputs.dayStop,
    });

    const [debouncedKey, setDebouncedKey] = useState(simKey);
    useEffect(() => {
        const t = setTimeout(() => setDebouncedKey(simKey), 600);
        return () => clearTimeout(t);
    }, [simKey]);

    useEffect(() => {
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
                    plan,
                    trials,
                    copyAccounts: 1,
                    discounts: {
                        evalPercent: entry.evalDiscountPercent,
                        activationPercent: entry.linkActivationDiscount
                            ? entry.evalDiscountPercent
                            : entry.activationDiscountPercent,
                    },
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
        return { monthlyNet, totalCost, totalFunding, totalAccounts, roi };
    }, [simmed, portfolio]);

    function addEntry() {
        onPortfolioChange([
            ...portfolio,
            {
                id: crypto.randomUUID(),
                firmId: currentFirm.id,
                planId: currentPlan.id,
                count: 1,
                evalDiscountPercent: 0,
                activationDiscountPercent: 0,
                linkActivationDiscount: false,
                memory: {},
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
        <Card className="px-5 py-4">
            <div className="mb-3 flex items-center justify-between gap-2">
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
                        <button
                            onClick={() => onPortfolioChange([])}
                            className="rounded border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                            Clear all
                        </button>
                    )}
                    <button
                        onClick={addEntry}
                        className="rounded border border-border bg-background px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted"
                    >
                        + Add firm
                    </button>
                </div>
            </div>

            {portfolio.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                    Add firms to build a cross-firm portfolio and see combined
                    expected monthly income.
                </p>
            ) : (
                <div className="space-y-4">
                    {totals && (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                            <SummaryCard
                                label="Combined monthly net"
                                value={formatCurrency(totals.monthlyNet)}
                                positive={totals.monthlyNet > 0}
                                info={{
                                    title: 'Combined monthly net',
                                    body: "Expected $ profit per month across all portfolio accounts after fees. Each row's expected monthly net × its account count, summed. Averaged over pass and bust outcomes.",
                                }}
                            />
                            <SummaryCard
                                label="Total funding"
                                value={formatCompactCurrency(
                                    totals.totalFunding,
                                )}
                                info={{
                                    title: 'Total funding',
                                    body: 'Combined account capital across all portfolio rows. = sum of (account size × account count) for each row. Represents your total notional exposure across firms.',
                                }}
                            />
                            <SummaryCard
                                label="Total eval cost"
                                value={formatCurrency(totals.totalCost)}
                                info={{
                                    title: 'Total eval cost',
                                    body: "Average all-in evaluation fees you'll pay per cycle across all accounts — eval, activation, monthly subs, and resets — weighted by account count. This is your expected outlay before any payout.",
                                }}
                            />
                            <SummaryCard
                                label="Total accounts"
                                value={String(totals.totalAccounts)}
                                info={{
                                    title: 'Total accounts',
                                    body: "Sum of account counts across all portfolio rows. Each row's count represents how many parallel funded accounts of that firm/plan you are running.",
                                }}
                            />
                            <SummaryCard
                                label="Annual ROI on fees"
                                value={formatPercent(totals.roi)}
                                positive={totals.roi > 0}
                                info={{
                                    title: 'Annual ROI on fees',
                                    body: 'Annualised return on your total evaluation spend. = (combined monthly net × 12) ÷ total eval cost − 1. Above 0 % means your expected payouts recover the full fee outlay within a year.',
                                }}
                            />
                        </div>
                    )}

                    <div className="overflow-x-auto">
                        <table className="w-full min-w-max text-xs whitespace-nowrap tabular-nums">
                            <thead className="text-muted-foreground">
                                <tr className="text-left">
                                    <th className="py-1 pr-3 font-medium">
                                        Firm
                                    </th>
                                    <th className="py-1 pr-3 font-medium">
                                        Plan
                                    </th>
                                    <th className="py-1 pr-3 font-medium">
                                        Accounts
                                    </th>
                                    <th className="py-1 pr-3 font-medium">
                                        Coupon
                                    </th>
                                    <th className="py-1 pr-3 font-medium">
                                        Pass%
                                    </th>
                                    <th className="py-1 pr-3 font-medium">
                                        Days P50
                                    </th>
                                    <th className="py-1 pr-3 font-medium">
                                        Net/acct
                                    </th>
                                    <th className="py-1 pr-3 font-medium">
                                        Combined net
                                    </th>
                                    <th className="py-1 pr-3 font-medium">
                                        Cost/acct
                                    </th>
                                    <th className="py-1 font-medium" />
                                </tr>
                            </thead>
                            <tbody>
                                {portfolio.map((entry) => {
                                    const sim = simmed.find(
                                        (s) => s.entry.id === entry.id,
                                    );
                                    const firm =
                                        firms.find(
                                            (f) => f.id === entry.firmId,
                                        ) ?? firms[0];
                                    if (!firm) return null;
                                    const plan =
                                        firm.findPlan(entry.planId) ??
                                        firm.plans[0];
                                    if (!plan) return null;
                                    return (
                                        <PortfolioRow
                                            key={entry.id}
                                            entry={entry}
                                            firm={firm}
                                            plan={plan}
                                            firms={firms}
                                            sim={sim}
                                            onUpdate={updateEntry}
                                            onRemove={removeEntry}
                                        />
                                    );
                                })}
                            </tbody>
                            {totals && simmed.length > 1 && (
                                <tfoot>
                                    <tr className="border-t-2 border-border/60 font-semibold text-foreground">
                                        <td
                                            colSpan={7}
                                            className="py-1.5 pr-3 text-muted-foreground"
                                        >
                                            Total ({totals.totalAccounts}{' '}
                                            accounts)
                                        </td>
                                        <td className="py-1.5 pr-3">
                                            {formatCurrency(totals.monthlyNet)}
                                        </td>
                                        <td className="py-1.5 pr-3">
                                            {formatCurrency(totals.totalCost)}
                                        </td>
                                        <td />
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>
            )}
        </Card>
    );
}

interface PortfolioRowProps {
    entry: PortfolioEntry;
    firm: PropFirm;
    plan: Plan;
    firms: readonly PropFirm[];
    sim: SimmedEntry | undefined;
    onUpdate: (id: string, patch: Partial<Omit<PortfolioEntry, 'id'>>) => void;
    onRemove: (id: string) => void;
}

function PortfolioRow({
    entry,
    firm,
    plan,
    firms,
    sim,
    onUpdate,
    onRemove,
}: PortfolioRowProps) {
    const maxAccounts = firm.maxFundedAccounts(plan);

    function handleFirmChange(firmId: string) {
        const newFirm = firms.find((f) => f.id === firmId);
        const firstPlan = newFirm?.plans[0];
        if (!newFirm || !firstPlan) return;
        onUpdate(entry.id, {
            firmId: firmId as FirmId,
            planId: firstPlan.id,
            count: Math.min(entry.count, newFirm.maxFundedAccounts(firstPlan)),
        });
    }

    function handlePlanChange(serialized: string) {
        const found = firm.plans.find(
            (p) => serializePlanId(p.id) === serialized,
        );
        if (!found) return;
        onUpdate(entry.id, {
            planId: found.id,
            count: Math.min(entry.count, firm.maxFundedAccounts(found)),
        });
    }

    function adjustCount(delta: number) {
        onUpdate(entry.id, {
            count: Math.max(1, Math.min(maxAccounts, entry.count + delta)),
        });
    }

    const atMin = entry.count <= 1;
    const atMax = entry.count >= maxAccounts;

    const effectiveActDiscount = entry.linkActivationDiscount
        ? entry.evalDiscountPercent
        : entry.activationDiscountPercent;
    const hasCoupon = entry.evalDiscountPercent > 0 || effectiveActDiscount > 0;
    const evalAfter =
        plan.fees.oneTimeEval * (1 - entry.evalDiscountPercent / 100);
    const actAfter = plan.fees.activation * (1 - effectiveActDiscount / 100);

    const out = sim?.out;

    return (
        <tr className="border-t border-border/40">
            <td className="py-1.5 pr-3">
                <Select
                    value={firm.id}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        handleFirmChange(e.target.value)
                    }
                    wrapperClassName="w-44"
                    className="h-7 text-xs"
                >
                    {firms.map((f) => (
                        <option key={f.id} value={f.id}>
                            {f.displayName}
                        </option>
                    ))}
                </Select>
            </td>
            <td className="py-1.5 pr-3">
                <Select
                    value={serializePlanId(plan.id)}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        handlePlanChange(e.target.value)
                    }
                    wrapperClassName="w-44"
                    className="h-7 text-xs"
                >
                    {firm.plans.map((p) => (
                        <option
                            key={serializePlanId(p.id)}
                            value={serializePlanId(p.id)}
                        >
                            {p.label}
                        </option>
                    ))}
                </Select>
            </td>
            <td className="py-1.5 pr-3">
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => adjustCount(-1)}
                        disabled={atMin}
                        className="flex h-5 w-5 items-center justify-center rounded text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                    >
                        −
                    </button>
                    <span className="min-w-12 text-center font-medium tabular-nums">
                        {entry.count}
                        <span className="text-muted-foreground">
                            {' / '}
                            {maxAccounts}
                        </span>
                    </span>
                    <button
                        onClick={() => adjustCount(1)}
                        disabled={atMax}
                        title={
                            atMax
                                ? `${firm.displayName} caps at ${maxAccounts}`
                                : undefined
                        }
                        className="flex h-5 w-5 items-center justify-center rounded text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                    >
                        +
                    </button>
                </div>
            </td>
            <td className="py-1.5 pr-3">
                <Popover>
                    <PopoverTrigger asChild>
                        <button
                            className={cn(
                                'flex h-6 items-center gap-1 rounded border px-2 text-[11px] font-medium transition-colors',
                                hasCoupon
                                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                                    : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
                            )}
                        >
                            <Tag className="size-3" />
                            {hasCoupon ? 'Applied' : 'Coupon'}
                        </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80" align="start">
                        <div className="flex flex-col gap-3">
                            <p className="text-xs font-semibold">
                                Coupon discounts
                            </p>
                            <div>
                                <div className="mb-1 flex items-center justify-between">
                                    <label className="text-xs text-muted-foreground">
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
                                        type="number"
                                        min={0}
                                        max={100}
                                        step={1}
                                        value={entry.evalDiscountPercent || ''}
                                        disabled={plan.fees.oneTimeEval === 0}
                                        onChange={(e) =>
                                            onUpdate(entry.id, {
                                                evalDiscountPercent: Number(
                                                    e.target.value,
                                                ),
                                            })
                                        }
                                        className="pr-7"
                                    />
                                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                                        %
                                    </span>
                                </div>
                            </div>
                            <div>
                                <div className="mb-1 flex items-center justify-between">
                                    <label className="text-xs text-muted-foreground">
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
                                            type="number"
                                            min={0}
                                            max={100}
                                            step={1}
                                            value={
                                                (entry.linkActivationDiscount
                                                    ? entry.evalDiscountPercent
                                                    : entry.activationDiscountPercent) ||
                                                ''
                                            }
                                            disabled={
                                                plan.fees.activation === 0 ||
                                                entry.linkActivationDiscount
                                            }
                                            onChange={(e) =>
                                                onUpdate(entry.id, {
                                                    activationDiscountPercent:
                                                        Number(e.target.value),
                                                })
                                            }
                                            className="pr-7"
                                        />
                                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                                            %
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={plan.fees.activation === 0}
                                        onClick={() =>
                                            onUpdate(entry.id, {
                                                linkActivationDiscount:
                                                    !entry.linkActivationDiscount,
                                            })
                                        }
                                        className={cn(
                                            'rounded-md border border-input px-2 text-xs font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50',
                                            entry.linkActivationDiscount
                                                ? 'bg-primary text-primary-foreground'
                                                : 'text-muted-foreground hover:text-foreground',
                                        )}
                                        aria-pressed={
                                            entry.linkActivationDiscount
                                        }
                                    >
                                        Match eval
                                    </button>
                                </div>
                            </div>
                            {hasCoupon && (
                                <button
                                    onClick={() =>
                                        onUpdate(entry.id, {
                                            evalDiscountPercent: 0,
                                            activationDiscountPercent: 0,
                                            linkActivationDiscount: false,
                                        })
                                    }
                                    className="text-left text-[11px] text-muted-foreground hover:text-foreground"
                                >
                                    Reset discounts
                                </button>
                            )}
                        </div>
                    </PopoverContent>
                </Popover>
            </td>
            <td className="py-1.5 pr-3">
                {out ? formatPercent(out.passProbability) : '—'}
            </td>
            <td className="py-1.5 pr-3">
                {out ? formatDays(out.daysToPassP50) : '—'}
            </td>
            <td
                className={cn(
                    'py-1.5 pr-3',
                    out &&
                        (out.expectedMonthlyNet >= 0
                            ? 'text-emerald-400'
                            : 'text-rose-400'),
                )}
            >
                {out ? formatCurrency(out.expectedMonthlyNet) : '—'}
            </td>
            <td className="py-1.5 pr-3 font-semibold text-foreground">
                {out
                    ? formatCurrency(out.expectedMonthlyNet * entry.count)
                    : '—'}
            </td>
            <td className="py-1.5 pr-3 text-muted-foreground">
                {out ? formatCurrency(out.expectedTotalCost) : '—'}
            </td>
            <td className="py-1.5">
                <button
                    onClick={() => onRemove(entry.id)}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Remove"
                >
                    ×
                </button>
            </td>
        </tr>
    );
}

function SummaryCard({
    label,
    value,
    positive,
    info,
}: {
    label: string;
    value: string;
    positive?: boolean;
    info?: { title: string; body: string };
}) {
    return (
        <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
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
        </div>
    );
}
