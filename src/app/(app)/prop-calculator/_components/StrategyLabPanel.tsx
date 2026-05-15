'use client';

import { Plus, RotateCcw, X } from 'lucide-react';
import { useMemo } from 'react';

import { Button } from '~/components/ui/Button';
import { Card } from '~/components/ui/Card';
import InfoPopover from '~/components/ui/InfoPopover';
import { Input } from '~/components/ui/Input';
import { Select } from '~/components/ui/Select';
import {
    formatCompactCurrency,
    formatCurrency,
    formatPercent,
} from '~/lib/format';
import {
    type CorrelationMode,
    type DayStopRule,
    type Plan,
} from '~/lib/prop-calculator';
import { cn } from '~/lib/utils';

import AccountsPassedDistributionChart from './AccountsPassedDistributionChart';
import DayStopRulePicker from './DayStopRulePicker';
import { type LabScenario } from './types';
import { useLabSimulation } from './useLabSimulation';

interface StrategyLabPanelProps {
    activationDiscountPercent: number;
    commissionPerRoundTrip: number;
    evalDiscountPercent: number;
    fundedHorizonDays: number;
    linkActivationDiscount: boolean;
    maxEvalDays: number;
    onAdd: () => void;
    onRemove: (id: string) => void;
    onReset: () => void;
    onUpdate: (id: string, patch: Partial<LabScenario>) => void;
    plan: Plan;
    scenarios: LabScenario[];
    seed: number;
}

const CORRELATION_LABEL: Record<CorrelationMode, string> = {
    copy: 'Copy-trade',
    grouped: 'Group-split',
    independent: 'Independent',
};

export default function StrategyLabPanel({
    activationDiscountPercent,
    commissionPerRoundTrip,
    evalDiscountPercent,
    fundedHorizonDays,
    linkActivationDiscount,
    maxEvalDays,
    onAdd,
    onRemove,
    onReset,
    onUpdate,
    plan,
    scenarios,
    seed,
}: StrategyLabPanelProps) {
    const { pending, results } = useLabSimulation({
        activationDiscountPercent,
        commissionPerRoundTrip,
        discountPercent: evalDiscountPercent,
        fundedHorizonDays,
        linkActivationDiscount,
        maxEvalDays,
        plan,
        scenarios,
        seed,
    });

    const verdict = useMemo(() => {
        if (results.size === 0) return null;
        let best: null | { id: string; monthly: number; score: number } = null;
        for (const sc of scenarios) {
            const r = results.get(sc.id);
            if (!r) continue;
            if (r.pAtLeast.kHalf < 0.5) continue;
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

    return (
        <Card className={cn('app-prop-calculator__strategy-lab', 'px-5 py-4')}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
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
                        onClick={onReset}
                        size="sm"
                        title="Reset to defaults"
                        variant="ghost"
                    >
                        <RotateCcw className="size-3.5" />
                        <span className="ml-1 text-xs">Reset</span>
                    </Button>
                    <Button onClick={onAdd} size="sm" variant="outline">
                        <Plus className="size-3.5" />
                        <span className="ml-1 text-xs">Add scenario</span>
                    </Button>
                </div>
            </div>

            <p className="mb-2 text-[11px] text-muted-foreground md:hidden">
                swipe to see more →
            </p>
            <div className="overflow-x-auto">
                <table
                    className={cn(
                        'app-prop-calculator__strategy-lab-table',
                        'w-full min-w-max text-xs whitespace-nowrap tabular-nums',
                    )}
                >
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
                                    className={cn(
                                        'border-t border-border/40 align-top',
                                        verdict?.id === sc.id &&
                                            'bg-emerald-500/5',
                                    )}
                                    key={sc.id}
                                >
                                    <td className="px-2 py-2">
                                        <Input
                                            className="h-7 w-32 text-xs"
                                            onChange={(e) =>
                                                onUpdate(sc.id, {
                                                    label: e.target.value,
                                                })
                                            }
                                            value={sc.label}
                                        />
                                    </td>
                                    <td className="px-2 py-2">
                                        <Input
                                            className="h-7 w-20 text-xs"
                                            min={1}
                                            onChange={(e) => {
                                                const n = Number(
                                                    e.target.value,
                                                );
                                                if (Number.isFinite(n) && n > 0)
                                                    onUpdate(sc.id, {
                                                        riskPerTrade: n,
                                                    });
                                            }}
                                            step={50}
                                            type="number"
                                            value={sc.riskPerTrade}
                                        />
                                    </td>
                                    <td className="px-2 py-2">
                                        <Input
                                            className="h-7 w-16 text-xs"
                                            max={95}
                                            min={5}
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
                                            step={1}
                                            type="number"
                                            value={Math.round(sc.winrate * 100)}
                                        />
                                    </td>
                                    <td className="px-2 py-2">
                                        <Input
                                            className="h-7 w-16 text-xs"
                                            max={10}
                                            min={0.5}
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
                                            step={0.5}
                                            type="number"
                                            value={sc.rrRatio}
                                        />
                                    </td>
                                    <td className="px-2 py-2">
                                        <Input
                                            className="h-7 w-14 text-xs"
                                            max={20}
                                            min={1}
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
                                            step={1}
                                            type="number"
                                            value={sc.tradesPerDay}
                                        />
                                    </td>
                                    <td className="px-2 py-2">
                                        <Input
                                            className="h-7 w-14 text-xs"
                                            max={20}
                                            min={1}
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
                                            step={1}
                                            type="number"
                                            value={sc.accounts}
                                        />
                                    </td>
                                    <td className="px-2 py-2">
                                        <Select
                                            className="h-7 w-36 text-xs"
                                            onChange={(e) =>
                                                onUpdate(sc.id, {
                                                    correlation: e.target
                                                        .value as CorrelationMode,
                                                })
                                            }
                                            value={sc.correlation}
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
                                            className="h-7 w-14 text-xs"
                                            disabled={
                                                sc.correlation !== 'grouped'
                                            }
                                            max={sc.accounts}
                                            min={1}
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
                                            step={1}
                                            type="number"
                                            value={sc.groups}
                                        />
                                    </td>
                                    <td className="px-2 py-2">
                                        <DayStopRulePicker
                                            compact
                                            onChange={(rule) =>
                                                onUpdate(sc.id, {
                                                    dayStop: rule,
                                                })
                                            }
                                            value={sc.dayStop}
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
                                            disabled={scenarios.length <= 1}
                                            onClick={() => onRemove(sc.id)}
                                            size="sm"
                                            title="Remove scenario"
                                            variant="ghost"
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
                                className="rounded-md border border-border/40 bg-muted/10 px-3 py-2 text-xs text-muted-foreground"
                                key={sc.id}
                            >
                                {sc.label}: simulating…
                            </div>
                        );
                    }
                    return (
                        <div
                            className="rounded-md border border-border/40 bg-muted/10 px-3 py-2"
                            key={sc.id}
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

function describeDayStop(rule: DayStopRule): string {
    switch (rule.kind) {
        case 'after-k-losses': {
            return `Stop ${rule.k}L`;
        }
        case 'after-target': {
            return `Stop $${rule.dollars}`;
        }
        case 'first-win': {
            return 'Stop on win';
        }
        case 'none': {
            return 'Take all';
        }
    }
}
