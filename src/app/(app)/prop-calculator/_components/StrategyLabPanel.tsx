'use client';

import { Plus, RotateCcw, X } from 'lucide-react';
import { useMemo } from 'react';

import { Button } from '~/components/ui/Button';
import { Card } from '~/components/ui/Card';
import { Input } from '~/components/ui/Input';
import { Select } from '~/components/ui/Select';
import {
    type CorrelationMode,
    type DayStopRule,
    type Plan,
} from '~/lib/prop-calculator';
import { cn } from '~/lib/utils';

import AccountsPassedDistributionChart from './AccountsPassedDistributionChart';
import DayStopRulePicker from './DayStopRulePicker';
import {
    formatCompactCurrency,
    formatCurrency,
    formatPercent,
} from './helpers';
import InfoPopover from './InfoPopover';
import { type LabScenario } from './types';
import { useLabSimulation } from './useLabSimulation';

interface StrategyLabPanelProps {
    plan: Plan;
    seed: number;
    maxEvalDays: number;
    fundedHorizonDays: number;
    commissionPerRoundTrip: number;
    evalDiscountPercent: number;
    activationDiscountPercent: number;
    linkActivationDiscount: boolean;
    scenarios: LabScenario[];
    onUpdate: (id: string, patch: Partial<LabScenario>) => void;
    onRemove: (id: string) => void;
    onAdd: () => void;
    onReset: () => void;
}

const CORRELATION_LABEL: Record<CorrelationMode, string> = {
    copy: 'Copy-trade',
    grouped: 'Group-split',
    independent: 'Independent',
};

function describeDayStop(rule: DayStopRule): string {
    switch (rule.kind) {
        case 'none':
            return 'Take all';
        case 'first-win':
            return 'Stop on win';
        case 'after-k-losses':
            return `Stop ${rule.k}L`;
        case 'after-target':
            return `Stop $${rule.dollars}`;
    }
}

export default function StrategyLabPanel({
    plan,
    seed,
    maxEvalDays,
    fundedHorizonDays,
    commissionPerRoundTrip,
    evalDiscountPercent,
    activationDiscountPercent,
    linkActivationDiscount,
    scenarios,
    onUpdate,
    onRemove,
    onAdd,
    onReset,
}: StrategyLabPanelProps) {
    const { results, pending } = useLabSimulation({
        plan,
        seed,
        maxEvalDays,
        fundedHorizonDays,
        commissionPerRoundTrip,
        scenarios,
        discountPercent: evalDiscountPercent,
        activationDiscountPercent,
        linkActivationDiscount,
    });

    const verdict = useMemo(() => {
        if (results.size === 0) return null;
        let best: { id: string; score: number; monthly: number } | null = null;
        for (const sc of scenarios) {
            const r = results.get(sc.id);
            if (!r) continue;
            if (r.pAtLeast.kHalf < 0.5) continue;
            if (!best || r.expectedMonthlyNet > best.monthly) {
                best = {
                    id: sc.id,
                    score: r.expectedMonthlyNet,
                    monthly: r.expectedMonthlyNet,
                };
            }
        }
        if (best) return best;
        let fallback: { id: string; score: number; monthly: number } | null =
            null;
        for (const sc of scenarios) {
            const r = results.get(sc.id);
            if (!r) continue;
            if (!fallback || r.expectedMonthlyNet > fallback.monthly) {
                fallback = {
                    id: sc.id,
                    score: r.expectedMonthlyNet,
                    monthly: r.expectedMonthlyNet,
                };
            }
        }
        return fallback;
    }, [results, scenarios]);

    const verdictScenario = verdict
        ? scenarios.find((s) => s.id === verdict.id)
        : null;
    const verdictResult = verdict ? results.get(verdict.id) : null;

    return (
        <Card className="px-5 py-4">
            <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">
                        Multi-account strategy lab
                    </h3>
                    <InfoPopover title="Multi-account strategy lab">
                        <p>
                            Compare execution strategies across multiple
                            accounts. Each row is a scenario with its own risk
                            sizing, win rate, frequency, and account
                            correlation:
                        </p>
                        <ul className="mt-2 list-disc pl-4">
                            <li>
                                <strong>Copy-trade</strong>: all accounts share
                                the same outcome — bimodal distribution.
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
                            Theoretical P(pass) is the closed-form
                            gambler&apos;s ruin sanity check. Day-stop modifies
                            the per-day trade loop (stop after first win, after
                            K losses, or after a $ target).
                        </p>
                    </InfoPopover>
                    {pending && (
                        <span className="text-[10px] text-muted-foreground">
                            simulating…
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={onReset}
                        title="Reset to defaults"
                    >
                        <RotateCcw className="size-3.5" />
                        <span className="ml-1 text-xs">Reset</span>
                    </Button>
                    <Button size="sm" variant="outline" onClick={onAdd}>
                        <Plus className="size-3.5" />
                        <span className="ml-1 text-xs">Add scenario</span>
                    </Button>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full min-w-max text-xs whitespace-nowrap tabular-nums">
                    <thead className="text-muted-foreground">
                        <tr className="text-left">
                            <th className="px-2 py-1 font-medium">Label</th>
                            <th className="px-2 py-1 font-medium">Risk $</th>
                            <th className="px-2 py-1 font-medium">WR %</th>
                            <th className="px-2 py-1 font-medium">RR</th>
                            <th className="px-2 py-1 font-medium">Tr/day</th>
                            <th className="px-2 py-1 font-medium">Accts</th>
                            <th className="px-2 py-1 font-medium">Mode</th>
                            <th className="px-2 py-1 font-medium">Groups</th>
                            <th className="px-2 py-1 font-medium">Day-stop</th>
                            <th className="px-2 py-1 font-medium">MC pass</th>
                            <th className="px-2 py-1 font-medium">Theo</th>
                            <th className="px-2 py-1 font-medium">P(≥1)</th>
                            <th className="px-2 py-1 font-medium">P(≥½)</th>
                            <th className="px-2 py-1 font-medium">P(all)</th>
                            <th className="px-2 py-1 font-medium">E[#pass]</th>
                            <th className="px-2 py-1 font-medium">E[$/mo]</th>
                            <th className="px-2 py-1 font-medium">Bust%</th>
                            <th className="px-2 py-1 font-medium" />
                        </tr>
                    </thead>
                    <tbody>
                        {scenarios.map((sc) => {
                            const r = results.get(sc.id);
                            return (
                                <tr
                                    key={sc.id}
                                    className={cn(
                                        'border-t border-border/40 align-top',
                                        verdict?.id === sc.id &&
                                            'bg-emerald-500/5',
                                    )}
                                >
                                    <td className="px-2 py-2">
                                        <Input
                                            value={sc.label}
                                            onChange={(e) =>
                                                onUpdate(sc.id, {
                                                    label: e.target.value,
                                                })
                                            }
                                            className="h-7 w-32 text-xs"
                                        />
                                    </td>
                                    <td className="px-2 py-2">
                                        <Input
                                            type="number"
                                            min={1}
                                            step={50}
                                            value={sc.riskPerTrade}
                                            onChange={(e) => {
                                                const n = Number(
                                                    e.target.value,
                                                );
                                                if (Number.isFinite(n) && n > 0)
                                                    onUpdate(sc.id, {
                                                        riskPerTrade: n,
                                                    });
                                            }}
                                            className="h-7 w-20 text-xs"
                                        />
                                    </td>
                                    <td className="px-2 py-2">
                                        <Input
                                            type="number"
                                            min={5}
                                            max={95}
                                            step={1}
                                            value={Math.round(sc.winrate * 100)}
                                            onChange={(e) => {
                                                const n =
                                                    Number(e.target.value) /
                                                    100;
                                                if (
                                                    Number.isFinite(n) &&
                                                    n >= 0.05 &&
                                                    n <= 0.95
                                                )
                                                    onUpdate(sc.id, {
                                                        winrate: n,
                                                    });
                                            }}
                                            className="h-7 w-16 text-xs"
                                        />
                                    </td>
                                    <td className="px-2 py-2">
                                        <Input
                                            type="number"
                                            min={0.5}
                                            max={10}
                                            step={0.5}
                                            value={sc.rrRatio}
                                            onChange={(e) => {
                                                const n = Number(
                                                    e.target.value,
                                                );
                                                if (
                                                    Number.isFinite(n) &&
                                                    n >= 0.5 &&
                                                    n <= 10
                                                )
                                                    onUpdate(sc.id, {
                                                        rrRatio: n,
                                                    });
                                            }}
                                            className="h-7 w-16 text-xs"
                                        />
                                    </td>
                                    <td className="px-2 py-2">
                                        <Input
                                            type="number"
                                            min={1}
                                            max={20}
                                            step={1}
                                            value={sc.tradesPerDay}
                                            onChange={(e) => {
                                                const n = Math.floor(
                                                    Number(e.target.value),
                                                );
                                                if (
                                                    Number.isFinite(n) &&
                                                    n >= 1 &&
                                                    n <= 20
                                                )
                                                    onUpdate(sc.id, {
                                                        tradesPerDay: n,
                                                    });
                                            }}
                                            className="h-7 w-14 text-xs"
                                        />
                                    </td>
                                    <td className="px-2 py-2">
                                        <Input
                                            type="number"
                                            min={1}
                                            max={20}
                                            step={1}
                                            value={sc.accounts}
                                            onChange={(e) => {
                                                const n = Math.floor(
                                                    Number(e.target.value),
                                                );
                                                if (
                                                    Number.isFinite(n) &&
                                                    n >= 1 &&
                                                    n <= 20
                                                )
                                                    onUpdate(sc.id, {
                                                        accounts: n,
                                                        groups: Math.min(
                                                            sc.groups,
                                                            n,
                                                        ),
                                                    });
                                            }}
                                            className="h-7 w-14 text-xs"
                                        />
                                    </td>
                                    <td className="px-2 py-2">
                                        <Select
                                            value={sc.correlation}
                                            onChange={(e) =>
                                                onUpdate(sc.id, {
                                                    correlation: e.target
                                                        .value as CorrelationMode,
                                                })
                                            }
                                            className="h-7 w-36 text-xs"
                                            wrapperClassName="w-36"
                                        >
                                            {(
                                                Object.keys(
                                                    CORRELATION_LABEL,
                                                ) as CorrelationMode[]
                                            ).map((mode) => (
                                                <option key={mode} value={mode}>
                                                    {CORRELATION_LABEL[mode]}
                                                </option>
                                            ))}
                                        </Select>
                                    </td>
                                    <td className="px-2 py-2">
                                        <Input
                                            type="number"
                                            min={1}
                                            max={sc.accounts}
                                            step={1}
                                            value={sc.groups}
                                            onChange={(e) => {
                                                const n = Math.floor(
                                                    Number(e.target.value),
                                                );
                                                if (
                                                    Number.isFinite(n) &&
                                                    n >= 1 &&
                                                    n <= sc.accounts
                                                )
                                                    onUpdate(sc.id, {
                                                        groups: n,
                                                    });
                                            }}
                                            disabled={
                                                sc.correlation !== 'grouped'
                                            }
                                            className="h-7 w-14 text-xs"
                                        />
                                    </td>
                                    <td className="px-2 py-2">
                                        <DayStopRulePicker
                                            value={sc.dayStop}
                                            onChange={(rule) =>
                                                onUpdate(sc.id, {
                                                    dayStop: rule,
                                                })
                                            }
                                            compact
                                        />
                                    </td>
                                    <td className="px-2 py-2 font-mono">
                                        {r
                                            ? formatPercent(r.perAccountPass)
                                            : '—'}
                                    </td>
                                    <td className="px-2 py-2 font-mono text-muted-foreground">
                                        {r
                                            ? formatPercent(
                                                  r.theoreticalPassProb,
                                              )
                                            : '—'}
                                    </td>
                                    <td className="px-2 py-2 font-mono">
                                        {r ? formatPercent(r.pAtLeast.k1) : '—'}
                                    </td>
                                    <td className="px-2 py-2 font-mono">
                                        {r
                                            ? formatPercent(r.pAtLeast.kHalf)
                                            : '—'}
                                    </td>
                                    <td className="px-2 py-2 font-mono">
                                        {r
                                            ? formatPercent(r.pAtLeast.kAll)
                                            : '—'}
                                    </td>
                                    <td className="px-2 py-2 font-mono">
                                        {r
                                            ? r.expectedAccountsPass.toFixed(1)
                                            : '—'}
                                    </td>
                                    <td
                                        className={cn(
                                            'px-2 py-2 font-mono',
                                            r &&
                                                (r.expectedMonthlyNet > 0
                                                    ? 'text-emerald-400'
                                                    : 'text-rose-400'),
                                        )}
                                    >
                                        {r
                                            ? formatCompactCurrency(
                                                  r.expectedMonthlyNet,
                                              )
                                            : '—'}
                                    </td>
                                    <td className="px-2 py-2 font-mono">
                                        {r ? formatPercent(r.pHitDDLimit) : '—'}
                                    </td>
                                    <td className="px-2 py-2">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => onRemove(sc.id)}
                                            disabled={scenarios.length <= 1}
                                            title="Remove scenario"
                                        >
                                            <X className="size-3.5" />
                                        </Button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
                {scenarios.map((sc) => {
                    const r = results.get(sc.id);
                    if (!r) {
                        return (
                            <div
                                key={sc.id}
                                className="rounded-md border border-border/40 bg-muted/10 px-3 py-2 text-xs text-muted-foreground"
                            >
                                {sc.label}: simulating…
                            </div>
                        );
                    }
                    return (
                        <div
                            key={sc.id}
                            className="rounded-md border border-border/40 bg-muted/10 px-3 py-2"
                        >
                            <div className="mb-1 flex items-center justify-between text-xs">
                                <span className="font-semibold">
                                    {sc.label}
                                </span>
                                <span className="font-mono text-muted-foreground">
                                    {sc.accounts} accts •{' '}
                                    {CORRELATION_LABEL[sc.correlation]} •{' '}
                                    {describeDayStop(sc.dayStop)}
                                </span>
                            </div>
                            <AccountsPassedDistributionChart
                                distribution={r.accountsPassDistribution}
                            />
                            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                                <span>
                                    E[max streak]:{' '}
                                    {r.expectedMaxLossStreak.toFixed(1)}
                                </span>
                                <span>
                                    Tr/day actual:{' '}
                                    {r.meanTradesPerDay.toFixed(2)}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {verdict && verdictScenario && verdictResult && (
                <div
                    className={cn(
                        'mt-4 rounded-md border px-3 py-2 text-xs',
                        verdictResult.pAtLeast.kHalf >= 0.5
                            ? 'border-emerald-500/30 bg-emerald-500/10'
                            : 'border-amber-500/30 bg-amber-500/10',
                    )}
                >
                    <span className="font-semibold">Verdict: </span>
                    <span>
                        <strong>{verdictScenario.label}</strong> wins on
                        expected monthly net (
                        {formatCurrency(verdictResult.expectedMonthlyNet)}).{' '}
                        {verdictResult.pAtLeast.kHalf >= 0.5
                            ? `P(≥${Math.ceil(
                                  verdictScenario.accounts / 2,
                              )} of ${verdictScenario.accounts} pass) = ${formatPercent(
                                  verdictResult.pAtLeast.kHalf,
                              )}.`
                            : `Warning: P(≥½ pass) only ${formatPercent(
                                  verdictResult.pAtLeast.kHalf,
                              )} — no scenario clears the 50% portfolio-survival bar.`}
                    </span>
                </div>
            )}
        </Card>
    );
}
