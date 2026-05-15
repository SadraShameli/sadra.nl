'use client';

import { Tag } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';

import { Card } from '~/components/ui/Card';
import InfoPopover from '~/components/ui/InfoPopover';
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

interface PortfolioRowProps {
    entry: PortfolioEntry;
    firm: PropFirm;
    firms: readonly PropFirm[];
    onRemove: (id: string) => void;
    onUpdate: (id: string, patch: Partial<Omit<PortfolioEntry, 'id'>>) => void;
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
                        <button
                            className="rounded border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            onClick={() => onPortfolioChange([])}
                        >
                            Clear all
                        </button>
                    )}
                    <button
                        className="rounded border border-border bg-background px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted"
                        onClick={addEntry}
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

                    <p className="mb-2 text-[11px] text-muted-foreground md:hidden">
                        swipe to see more →
                    </p>
                    <div className="overflow-x-auto">
                        <table
                            className={cn(
                                'app-prop-calculator__portfolio-table',
                                'w-full min-w-max text-xs whitespace-nowrap tabular-nums',
                            )}
                        >
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
                                            entry={entry}
                                            firm={firm}
                                            firms={firms}
                                            key={entry.id}
                                            onRemove={removeEntry}
                                            onUpdate={updateEntry}
                                            plan={plan}
                                            sim={sim}
                                        />
                                    );
                                })}
                            </tbody>
                            {totals && simmed.length > 1 && (
                                <tfoot>
                                    <tr className="border-t-2 border-border/60 font-semibold text-foreground">
                                        <td
                                            className="py-1.5 pr-3 text-muted-foreground"
                                            colSpan={7}
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

function PortfolioRow({
    entry,
    firm,
    firms,
    onRemove,
    onUpdate,
    plan,
    sim,
}: PortfolioRowProps) {
    const maxAccounts = firm.maxFundedAccounts(plan);

    function handleFirmChange(firmId: string) {
        const newFirm = firms.find((f) => f.id === (firmId as FirmId));
        const firstPlan = newFirm?.plans[0];
        if (!newFirm || !firstPlan) return;
        onUpdate(entry.id, {
            count: Math.min(entry.count, newFirm.maxFundedAccounts(firstPlan)),
            firmId: firmId as FirmId,
            planId: firstPlan.id,
        });
    }

    function handlePlanChange(serialized: string) {
        const found = firm.plans.find(
            (p) => serializePlanId(p.id) === serialized,
        );
        if (!found) return;
        onUpdate(entry.id, {
            count: Math.min(entry.count, firm.maxFundedAccounts(found)),
            planId: found.id,
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
                    className="h-7 text-xs"
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        handleFirmChange(e.target.value)
                    }
                    value={firm.id}
                    wrapperClassName="w-44"
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
                    className="h-7 text-xs"
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        handlePlanChange(e.target.value)
                    }
                    value={serializePlanId(plan.id)}
                    wrapperClassName="w-44"
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
                        className="flex h-5 w-5 items-center justify-center rounded text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                        disabled={atMin}
                        onClick={() => adjustCount(-1)}
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
                        className="flex h-5 w-5 items-center justify-center rounded text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                        disabled={atMax}
                        onClick={() => adjustCount(1)}
                        title={
                            atMax
                                ? `${firm.displayName} caps at ${maxAccounts}`
                                : undefined
                        }
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
                    <PopoverContent align="start" className="w-80">
                        <div className="flex flex-col gap-3">
                            <p className="text-xs font-semibold">
                                Coupon discounts
                            </p>
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
                                                    activationDiscountPercent:
                                                        Number(e.target.value),
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
                                    <button
                                        aria-pressed={
                                            entry.linkActivationDiscount
                                        }
                                        className={cn(
                                            'rounded-md border border-input px-2 text-xs font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50',
                                            entry.linkActivationDiscount
                                                ? 'bg-primary text-primary-foreground'
                                                : 'text-muted-foreground hover:text-foreground',
                                        )}
                                        disabled={plan.fees.activation === 0}
                                        onClick={() =>
                                            onUpdate(entry.id, {
                                                linkActivationDiscount:
                                                    !entry.linkActivationDiscount,
                                            })
                                        }
                                        type="button"
                                    >
                                        Match eval
                                    </button>
                                </div>
                            </div>
                            {hasCoupon && (
                                <button
                                    className="text-left text-[11px] text-muted-foreground hover:text-foreground"
                                    onClick={() =>
                                        onUpdate(entry.id, {
                                            activationDiscountPercent: 0,
                                            evalDiscountPercent: 0,
                                            linkActivationDiscount: false,
                                        })
                                    }
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
                    aria-label="Remove"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => onRemove(entry.id)}
                >
                    ×
                </button>
            </td>
        </tr>
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
