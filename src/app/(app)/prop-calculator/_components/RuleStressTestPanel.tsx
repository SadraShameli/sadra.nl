'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Card } from '~/components/ui/Card';
import { DataTable } from '~/components/ui/DataTable';
import { EmptyState } from '~/components/ui/EmptyState';
import InfoPopover from '~/components/ui/InfoPopover';
import { formatCurrency, formatPercent } from '~/lib/format';
import {
    type DailyLossLimitConfig,
    type Plan,
    type SimInputs,
    type SimOutputs,
    simulate,
    withPlanOverrides,
} from '~/lib/prop-calculator';
import { cn } from '~/lib/utilities';

import RuleStressBarChartView from './charts/RuleStressBarChartView';

interface RuleStressTestPanelProperties {
    baseInputs: SimInputs;
}

interface ScenarioRow {
    isNoOp: boolean;
    label: string;
    out: SimOutputs;
}

interface StressScenario {
    isNoOp: boolean;
    label: string;
    plan: Plan;
}

const MAX_TRIALS = 500;

export default function RuleStressTestPanel({
    baseInputs,
}: RuleStressTestPanelProperties) {
    const [rows, setRows] = useState<ScenarioRow[]>([]);
    const [pending, setPending] = useState(false);
    const inputsReference = useRef(baseInputs);
    inputsReference.current = baseInputs;

    const debouncedKey = useDebouncedKey(baseInputs);

    useEffect(() => {
        let isCancelled = false;
        setPending(true);
        const handle = setTimeout(() => {
            const inputs = inputsReference.current;
            const trials = Math.min(MAX_TRIALS, inputs.trials);
            // Identical seed and trial count across every scenario for a
            // like-for-like comparison. Note this isn't a pure common-
            // random-numbers setup: `simulate()` advances one shared RNG
            // across all trials in a call, and a funded-phase-only rule
            // change (e.g. the ladder cut) can change how many days a
            // given trial's funded phase runs before busting or closing
            // out, which shifts how much of the stream later trials
            // consume. Trial 0 is always a true apples-to-apples replay;
            // later trials can diverge once an earlier trial's funded
            // phase does.
            const scenarios = buildStressScenarios(inputs.plan);
            const results: ScenarioRow[] = scenarios.map(
                ({ isNoOp, label, plan }) => ({
                    isNoOp,
                    label,
                    out: simulate({ ...inputs, plan, trials }),
                }),
            );
            if (!isCancelled) {
                setRows(results);
                setPending(false);
            }
        }, 0);
        return () => {
            isCancelled = true;
            clearTimeout(handle);
        };
    }, [debouncedKey]);

    const baseline = rows[0] ?? null;

    const chartRows = useMemo(
        () =>
            rows.map((r) => ({
                label: r.label,
                monthlyNet: r.out.expectedMonthlyNet,
            })),
        [rows],
    );

    const columns = useMemo<ColumnDef<ScenarioRow>[]>(
        () => [
            {
                accessorFn: (r) => r.label,
                cell: ({ row }) => (
                    <div className="flex flex-col">
                        <span className="font-medium text-foreground">
                            {row.original.label}
                        </span>
                        {row.original.isNoOp && (
                            <span className="flex items-center gap-1 text-[10px] text-amber-400">
                                <TriangleAlert className="size-3" />
                                no DLL on this plan — no effect
                            </span>
                        )}
                    </div>
                ),
                header: 'Scenario',
                id: 'scenario',
            },
            {
                accessorFn: (r) => r.out.expectedMonthlyNet,
                cell: ({ row }) =>
                    formatCurrency(row.original.out.expectedMonthlyNet),
                header: 'Monthly net',
                id: 'monthlyNet',
            },
            {
                accessorFn: (r) =>
                    r.out.expectedMonthlyNet -
                    (baseline?.out.expectedMonthlyNet ?? 0),
                cell: ({ row }) => {
                    if (!baseline) return '—';
                    const delta =
                        row.original.out.expectedMonthlyNet -
                        baseline.out.expectedMonthlyNet;
                    return (
                        <span className={deltaClass(delta)}>
                            {formatSignedCurrency(delta)}
                        </span>
                    );
                },
                header: 'Δ$ vs baseline',
                id: 'deltaDollars',
            },
            {
                accessorFn: (r) => pctDelta(r.out.expectedMonthlyNet, baseline),
                cell: ({ row }) => {
                    if (!baseline || baseline.out.expectedMonthlyNet === 0) {
                        return '—';
                    }
                    const pct = pctDelta(
                        row.original.out.expectedMonthlyNet,
                        baseline,
                    );
                    return (
                        <span className={deltaClass(pct)}>
                            {formatSignedPercent(pct)}
                        </span>
                    );
                },
                header: 'Δ% vs baseline',
                id: 'deltaPercent',
            },
            {
                accessorFn: (r) => r.out.passProbability,
                cell: ({ row }) =>
                    formatPercent(row.original.out.passProbability),
                header: 'Pass%',
                id: 'pass',
            },
            {
                accessorFn: (r) => r.out.bustProbability,
                cell: ({ row }) =>
                    formatPercent(row.original.out.bustProbability),
                header: 'Bust%',
                id: 'bust',
            },
        ],
        [baseline],
    );

    return (
        <Card
            className={cn('app-prop-calculator__rule-stress-test', 'px-5 py-4')}
        >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">Rule stress test</h3>
                    <InfoPopover title="Rule stress test">
                        Prop firms tighten their rules over time. This runs your
                        current setup against 4 hypothetical tightenings —
                        daily-loss-limit halved, payout ladder cut 20%, safety
                        net raised 50%, and the qualifying-day profit bar raised
                        40% — using the same seed and trial count as the
                        baseline for a like-for-like comparison. Note that
                        because a funded-phase rule change can shift how many
                        days a given trial runs before busting or closing out
                        its payout ladder, later trials can still draw a
                        different random path than the baseline once the two
                        diverge — so treat differences as directionally
                        informative, not a pure noise-free A/B test. Shows how
                        resilient your edge is if the firm changes the rules on
                        you.
                    </InfoPopover>
                </div>
                {pending && (
                    <span className="text-xs text-muted-foreground">
                        computing…
                    </span>
                )}
            </div>

            {rows.length === 0 ? (
                <EmptyState
                    description="Adjust your inputs to see how your edge holds up against tighter rules."
                    title="No data yet"
                />
            ) : (
                <div className="flex flex-col gap-4">
                    <RuleStressBarChartView rows={chartRows} />
                    <DataTable<ScenarioRow, unknown>
                        className="app-prop-calculator__rule-stress-table text-xs tabular-nums"
                        columns={columns}
                        data={rows}
                        pageSize={null}
                        rowId={(r) => r.label}
                    />
                </div>
            )}
        </Card>
    );
}

function buildDllHalvedScenario(basePlan: Plan): StressScenario {
    const isNoOp =
        basePlan.evalDailyLossLimit.kind === 'none' &&
        basePlan.fundedDailyLossLimit.kind === 'none';
    return {
        isNoOp,
        label: 'DLL ×0.5',
        plan: withPlanOverrides(basePlan, {
            evalDailyLossLimit: halveDailyLossLimit(
                basePlan.evalDailyLossLimit,
            ),
            fundedDailyLossLimit: halveDailyLossLimit(
                basePlan.fundedDailyLossLimit,
            ),
        }),
    };
}

function buildLadderCutScenario(basePlan: Plan): StressScenario {
    if (basePlan.payoutLadder) {
        const ladder = basePlan.payoutLadder;
        return {
            isNoOp: false,
            label: 'Payout ladder −20%',
            plan: withPlanOverrides(basePlan, {
                payoutLadder: {
                    minRequestAmount: ladder.minRequestAmount,
                    steps: ladder.steps.map((step) => step * 0.8),
                },
            }),
        };
    }
    // No ladder on this firm — the closest analog is cutting the trader's
    // profit share on every payout tier by the same 20%.
    return {
        isNoOp: false,
        label: 'Payout share −20%',
        plan: withPlanOverrides(basePlan, {
            payoutTiers: basePlan.payoutTiers.map((tier) => ({
                ...tier,
                traderShare: tier.traderShare * 0.8,
            })),
        }),
    };
}

function buildQualifyingBarScenario(basePlan: Plan): StressScenario {
    if (basePlan.minQualifyingDayProfit !== null) {
        return {
            isNoOp: false,
            label: 'Qualifying bar +40%',
            plan: withPlanOverrides(basePlan, {
                minQualifyingDayProfit: basePlan.minQualifyingDayProfit * 1.4,
            }),
        };
    }
    // No qualifying-day concept on this firm — the closest analog is making
    // the eval's profit target itself 40% harder to reach (an interpretation
    // call, not a hard fact about that firm's actual rules).
    return {
        isNoOp: false,
        label: 'Profit target +40% (proxy)',
        plan: withPlanOverrides(basePlan, {
            profitTarget: basePlan.profitTarget * 1.4,
        }),
    };
}

function buildSafetyNetScenario(basePlan: Plan): StressScenario {
    return {
        isNoOp: false,
        label: 'Safety net ×1.5',
        plan: withPlanOverrides(basePlan, {
            minPayoutProfit: basePlan.minPayoutProfit * 1.5,
        }),
    };
}

function buildStressScenarios(basePlan: Plan): StressScenario[] {
    return [
        { isNoOp: false, label: 'Baseline', plan: basePlan },
        buildDllHalvedScenario(basePlan),
        buildLadderCutScenario(basePlan),
        buildSafetyNetScenario(basePlan),
        buildQualifyingBarScenario(basePlan),
    ];
}

function deltaClass(delta: number): string {
    if (Math.abs(delta) < 1e-9) return 'text-muted-foreground';
    return delta > 0 ? 'text-emerald-400' : 'text-rose-400';
}

function formatSignedCurrency(n: number): string {
    const sign = n > 0 ? '+' : '';
    return `${sign}${formatCurrency(n)}`;
}

function formatSignedPercent(p: number): string {
    const sign = p > 0 ? '+' : '';
    return `${sign}${formatPercent(p)}`;
}

function halveDailyLossLimit(
    config: DailyLossLimitConfig,
): DailyLossLimitConfig {
    switch (config.kind) {
        case 'flat': {
            return { amount: config.amount / 2, kind: 'flat' };
        }
        case 'none': {
            return config;
        }
        case 'tiered': {
            return {
                kind: 'tiered',
                tiers: config.tiers.map((tier) => ({
                    ...tier,
                    dailyLossLimit: tier.dailyLossLimit / 2,
                })),
            };
        }
    }
}

function pctDelta(value: number, baseline: null | ScenarioRow): number {
    if (!baseline || baseline.out.expectedMonthlyNet === 0) return 0;
    return (
        (value - baseline.out.expectedMonthlyNet) /
        Math.abs(baseline.out.expectedMonthlyNet)
    );
}

function useDebouncedKey(inputs: SimInputs): string {
    const key = JSON.stringify({
        act: inputs.discounts?.activationPercent ?? 0,
        commission: inputs.commissionPerRoundTrip ?? 0,
        eval: inputs.discounts?.evalPercent ?? 0,
        planId: inputs.plan.id,
        risk: inputs.riskPerTrade,
        rr: inputs.rrRatio,
        seed: inputs.seed,
        tpd: inputs.tradesPerDay,
        trials: inputs.trials,
        winrate: inputs.winrate,
    });
    const [debounced, setDebounced] = useState(key);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(key), 500);
        return () => clearTimeout(t);
    }, [key]);
    return debounced;
}
