'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { Plus, RotateCcw, X } from 'lucide-react';
import { useMemo } from 'react';

import { Alert, AlertDescription } from '~/components/ui/Alert';
import { Button } from '~/components/ui/Button';
import { Card, CardContent } from '~/components/ui/Card';
import { DataTable } from '~/components/ui/DataTable';
import InfoPopover from '~/components/ui/InfoPopover';
import { Input } from '~/components/ui/Input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
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
import { cn } from '~/lib/utilities';

import AccountsPassedDistributionChart from './AccountsPassedDistributionChart';
import DayStopRulePicker from './DayStopRulePicker';
import { type LabScenario } from './types';
import { useLabSimulation } from './useLabSimulation';

type LabResult =
    ReturnType<typeof useLabSimulation>['results'] extends Map<string, infer R>
        ? R
        : never;

interface StrategyLabPanelProperties {
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

interface StrategyLabRow {
    isVerdict: boolean;
    onlyOne: boolean;
    result: LabResult | undefined;
    scenario: LabScenario;
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
}: StrategyLabPanelProperties) {
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
            <div className="flex flex-wrap items-center justify-between gap-2">
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
            <StrategyLabTable
                onRemove={onRemove}
                onUpdate={onUpdate}
                pending={pending}
                rows={scenarios.map((sc) => ({
                    isVerdict: verdict?.id === sc.id,
                    onlyOne: scenarios.length <= 1,
                    result: results.get(sc.id),
                    scenario: sc,
                }))}
            />

            <div className="mt-4 grid gap-3">
                {scenarios.map((sc) => {
                    const r = results.get(sc.id);
                    if (!r) {
                        return (
                            <Card className="gap-1 py-2" key={sc.id}>
                                <CardContent className="px-3 text-xs text-muted-foreground">
                                    {sc.label}: simulating…
                                </CardContent>
                            </Card>
                        );
                    }
                    return (
                        <Card className="gap-1 py-2" key={sc.id}>
                            <CardContent className="px-3">
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
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {verdict && verdictScenario && verdictResult && (
                <Alert
                    className="mt-4"
                    variant={
                        verdictResult.pAtLeast.kHalf >= 0.5
                            ? 'success'
                            : 'warning'
                    }
                >
                    <AlertDescription className="text-xs">
                        <span className="font-semibold">Verdict: </span>
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
                    </AlertDescription>
                </Alert>
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

function ResultCell({
    children,
    className,
    value,
}: {
    children: (v: number) => React.ReactNode;
    className?: string;
    value: number | undefined;
}) {
    return (
        <span className={cn('font-mono', className)}>
            {value === undefined ? '—' : children(value)}
        </span>
    );
}

function StrategyLabTable({
    onRemove,
    onUpdate,
    pending,
    rows,
}: {
    onRemove: (id: string) => void;
    onUpdate: (id: string, patch: Partial<LabScenario>) => void;
    pending: boolean;
    rows: StrategyLabRow[];
}) {
    const columns = useMemo<ColumnDef<StrategyLabRow>[]>(
        () => [
            {
                cell: ({ row }) => (
                    <Input
                        className="h-7 w-32 text-xs"
                        onChange={(event) =>
                            onUpdate(row.original.scenario.id, {
                                label: event.target.value,
                            })
                        }
                        value={row.original.scenario.label}
                    />
                ),
                header: 'Label',
                id: 'label',
            },
            {
                cell: ({ row }) => (
                    <Input
                        className="h-7 w-20 text-xs"
                        min={1}
                        onChange={(event) => {
                            const n = Number(event.target.value);
                            if (Number.isFinite(n) && n > 0)
                                onUpdate(row.original.scenario.id, {
                                    riskPerTrade: n,
                                });
                        }}
                        step={50}
                        type="number"
                        value={row.original.scenario.riskPerTrade}
                    />
                ),
                header: 'Risk $',
                id: 'risk',
            },
            {
                cell: ({ row }) => (
                    <Input
                        className="h-7 w-16 text-xs"
                        max={95}
                        min={5}
                        onChange={(event) => {
                            const n = Number(event.target.value) / 100;
                            if (Number.isFinite(n) && n >= 0.05 && n <= 0.95)
                                onUpdate(row.original.scenario.id, {
                                    winrate: n,
                                });
                        }}
                        step={1}
                        type="number"
                        value={Math.round(row.original.scenario.winrate * 100)}
                    />
                ),
                header: 'WR %',
                id: 'wr',
            },
            {
                cell: ({ row }) => (
                    <Input
                        className="h-7 w-16 text-xs"
                        max={10}
                        min={0.5}
                        onChange={(event) => {
                            const n = Number(event.target.value);
                            if (Number.isFinite(n) && n >= 0.5 && n <= 10)
                                onUpdate(row.original.scenario.id, {
                                    rrRatio: n,
                                });
                        }}
                        step={0.5}
                        type="number"
                        value={row.original.scenario.rrRatio}
                    />
                ),
                header: 'RR',
                id: 'rr',
            },
            {
                cell: ({ row }) => (
                    <Input
                        className="h-7 w-14 text-xs"
                        max={20}
                        min={1}
                        onChange={(event) => {
                            const n = Math.floor(Number(event.target.value));
                            if (Number.isFinite(n) && n >= 1 && n <= 20)
                                onUpdate(row.original.scenario.id, {
                                    tradesPerDay: n,
                                });
                        }}
                        step={1}
                        type="number"
                        value={row.original.scenario.tradesPerDay}
                    />
                ),
                header: 'Tr/day',
                id: 'tpd',
            },
            {
                cell: ({ row }) => {
                    const sc = row.original.scenario;
                    return (
                        <Input
                            className="h-7 w-14 text-xs"
                            max={20}
                            min={1}
                            onChange={(event) => {
                                const n = Math.floor(
                                    Number(event.target.value),
                                );
                                if (Number.isFinite(n) && n >= 1 && n <= 20)
                                    onUpdate(sc.id, {
                                        accounts: n,
                                        groups: Math.min(sc.groups, n),
                                    });
                            }}
                            step={1}
                            type="number"
                            value={sc.accounts}
                        />
                    );
                },
                header: 'Accts',
                id: 'accts',
            },
            {
                cell: ({ row }) => (
                    <Select
                        onValueChange={(v) =>
                            onUpdate(row.original.scenario.id, {
                                correlation: v as CorrelationMode,
                            })
                        }
                        value={row.original.scenario.correlation}
                    >
                        <SelectTrigger className="h-7 w-36 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {(
                                Object.keys(
                                    CORRELATION_LABEL,
                                ) as CorrelationMode[]
                            ).map((mode) => (
                                <SelectItem key={mode} value={mode}>
                                    {CORRELATION_LABEL[mode]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ),
                header: 'Mode',
                id: 'mode',
            },
            {
                cell: ({ row }) => {
                    const sc = row.original.scenario;
                    return (
                        <Input
                            className="h-7 w-14 text-xs"
                            disabled={sc.correlation !== 'grouped'}
                            max={sc.accounts}
                            min={1}
                            onChange={(event) => {
                                const n = Math.floor(
                                    Number(event.target.value),
                                );
                                if (
                                    Number.isFinite(n) &&
                                    n >= 1 &&
                                    n <= sc.accounts
                                )
                                    onUpdate(sc.id, { groups: n });
                            }}
                            step={1}
                            type="number"
                            value={sc.groups}
                        />
                    );
                },
                header: 'Groups',
                id: 'groups',
            },
            {
                cell: ({ row }) => (
                    <DayStopRulePicker
                        compact
                        onChange={(rule) =>
                            onUpdate(row.original.scenario.id, {
                                dayStop: rule,
                            })
                        }
                        value={row.original.scenario.dayStop}
                    />
                ),
                header: 'Day-stop',
                id: 'day-stop',
            },
            {
                accessorFn: (r) => r.result?.perAccountPass ?? -1,
                cell: ({ row }) => (
                    <ResultCell value={row.original.result?.perAccountPass}>
                        {(v) => formatPercent(v)}
                    </ResultCell>
                ),
                header: 'MC pass',
                id: 'mc-pass',
            },
            {
                accessorFn: (r) => r.result?.theoreticalPassProb ?? -1,
                cell: ({ row }) => (
                    <ResultCell
                        className="text-muted-foreground"
                        value={row.original.result?.theoreticalPassProb}
                    >
                        {(v) => formatPercent(v)}
                    </ResultCell>
                ),
                header: 'Theo',
                id: 'theo',
            },
            {
                accessorFn: (r) => r.result?.pAtLeast.k1 ?? -1,
                cell: ({ row }) => (
                    <ResultCell value={row.original.result?.pAtLeast.k1}>
                        {(v) => formatPercent(v)}
                    </ResultCell>
                ),
                header: 'P(≥1)',
                id: 'p1',
            },
            {
                accessorFn: (r) => r.result?.pAtLeast.kHalf ?? -1,
                cell: ({ row }) => (
                    <ResultCell value={row.original.result?.pAtLeast.kHalf}>
                        {(v) => formatPercent(v)}
                    </ResultCell>
                ),
                header: 'P(≥½)',
                id: 'phalf',
            },
            {
                accessorFn: (r) => r.result?.pAtLeast.kAll ?? -1,
                cell: ({ row }) => (
                    <ResultCell value={row.original.result?.pAtLeast.kAll}>
                        {(v) => formatPercent(v)}
                    </ResultCell>
                ),
                header: 'P(all)',
                id: 'pall',
            },
            {
                accessorFn: (r) => r.result?.expectedAccountsPass ?? -1,
                cell: ({ row }) => (
                    <ResultCell
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
                        className={
                            row.original.result &&
                            (row.original.result.expectedMonthlyNet > 0
                                ? 'text-emerald-400'
                                : 'text-rose-400')
                        }
                        value={row.original.result?.expectedMonthlyNet}
                    >
                        {(v) => formatCompactCurrency(v)}
                    </ResultCell>
                ),
                header: 'E[$/mo]',
                id: 'monthly',
            },
            {
                accessorFn: (r) => r.result?.pHitDDLimit ?? -1,
                cell: ({ row }) => (
                    <ResultCell value={row.original.result?.pHitDDLimit}>
                        {(v) => formatPercent(v)}
                    </ResultCell>
                ),
                header: 'Bust%',
                id: 'bust',
            },
            {
                cell: ({ row }) => (
                    <Button
                        disabled={row.original.onlyOne}
                        onClick={() => onRemove(row.original.scenario.id)}
                        size="sm"
                        title="Remove scenario"
                        variant="ghost"
                    >
                        <X className="size-3.5" />
                    </Button>
                ),
                header: () => <span className="sr-only">Actions</span>,
                id: 'remove',
            },
        ],
        [onRemove, onUpdate],
    );

    return (
        <DataTable<StrategyLabRow, unknown>
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
