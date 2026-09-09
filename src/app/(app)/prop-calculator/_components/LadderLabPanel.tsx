'use client';

import { FlaskConical } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '~/components/ui/Button';
import { Card } from '~/components/ui/Card';
import { DataTable, type DataTableColumn } from '~/components/ui/DataTable';
import InfoPopover from '~/components/ui/InfoPopover';
import { Input } from '~/components/ui/Input';
import { formatCurrency, formatPercent } from '~/lib/format';
import {
    ALL_INSTRUMENTS,
    type DayPolicy,
    type DayStopRule,
    INSTRUMENTS,
    InstrumentSymbol,
    type LadderScore,
    ladderSum,
    minStopPoints,
    type Plan,
    type RungSizing,
} from '~/lib/prop-calculator';
import { cn } from '~/lib/utilities';

import LadderFrontierChartView from './charts/LadderFrontierChartView';
import DayStopRulePicker from './DayStopRulePicker';
import { useLadderSearch } from './useLadderSearch';

interface LadderLabPanelProperties {
    activePolicy: DayPolicy | null;
    maxEvalDays: number;
    onApply: (policy: DayPolicy | null) => void;
    plan: Plan;
    rrRatio: number;
    seed: number;
    winrate: number;
}

export default function LadderLabPanel({
    activePolicy,
    maxEvalDays,
    onApply,
    plan,
    rrRatio,
    seed,
    winrate,
}: LadderLabPanelProperties) {
    const cushion = plan.drawdown.amount;
    const [lo, setLo] = useState(100);
    const [max, setMax] = useState(Math.round(cushion * 0.4));
    const [step, setStep] = useState(100);
    const [slots, setSlots] = useState(4);
    const [sims, setSims] = useState(4000);
    const [instrument, setInstrument] = useState<'' | InstrumentSymbol>(
        InstrumentSymbol.NQ,
    );
    const [stopRule, setStopRule] = useState<DayStopRule>({
        kind: 'day-green',
    });
    const [rungSizing, setSizingMode] = useState<RungSizing>('capToCushion');
    const { cancel, run, state } = useLadderSearch();

    const aliasingFrom = Math.round(cushion * 0.4);
    const isAliasingRisk = max > aliasingFrom;
    const pointValue =
        instrument === '' ? null : INSTRUMENTS[instrument].pointValue;
    const contractCap = plan.contractLimits?.evalMinis ?? null;

    const rows = useMemo(() => {
        const result = state.result;
        if (!result) return [];
        const seen = new Set<string>();
        const merged: LadderScore[] = [];
        for (const score of [
            ...result.bySpeed,
            ...result.byCost,
            ...result.byPassRate,
        ]) {
            const key = score.ladder.join(',');
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(score);
        }
        return merged;
    }, [state.result]);

    const columns = useMemo<DataTableColumn<LadderScore>[]>(
        () => [
            {
                accessorFn: (r) => r.ladder.join(' / '),
                cell: ({ row }) => (
                    <span className="font-mono">
                        {row.original.ladder.join(' / ')}
                    </span>
                ),
                header: 'Ladder',
                id: 'ladder',
            },
            {
                accessorFn: (r) => ladderSum(r.ladder),
                cell: ({ row }) =>
                    formatCurrency(ladderSum(row.original.ladder)),
                header: 'Sum',
                id: 'sum',
            },
            {
                accessorFn: (r) => r.passRate,
                cell: ({ row }) => formatPercent(row.original.passRate),
                header: 'Pass%',
                id: 'pass',
            },
            {
                accessorFn: (r) => r.expectedDaysToFunded,
                cell: ({ row }) => row.original.expectedDaysToFunded.toFixed(1),
                header: 'Days to funded',
                id: 'days',
            },
            {
                accessorFn: (r) => r.costPerFunded,
                cell: ({ row }) => formatCurrency(row.original.costPerFunded),
                header: '$ / funded',
                id: 'cost',
            },
            {
                accessorFn: (r) =>
                    contractCap === null || pointValue === null
                        ? 0
                        : (minStopPoints(
                              Math.max(...r.ladder),
                              contractCap,
                              pointValue,
                          ) ?? 0),
                cell: ({ row }) => {
                    const stop =
                        contractCap === null || pointValue === null
                            ? null
                            : minStopPoints(
                                  Math.max(...row.original.ladder),
                                  contractCap,
                                  pointValue,
                              );
                    return (
                        <span className="text-muted-foreground">
                            {stop === null ? '—' : `${stop.toFixed(1)} pt`}
                        </span>
                    );
                },
                header: 'Min stop',
                id: 'minStop',
            },
            {
                cell: ({ row }) => {
                    const isActive =
                        activePolicy !== null &&
                        activePolicy.ladder.join(',') ===
                            row.original.ladder.join(',');
                    return (
                        <button
                            className="text-xs text-muted-foreground underline"
                            onClick={() =>
                                onApply(
                                    isActive
                                        ? null
                                        : {
                                              ladder: [...row.original.ladder],
                                              maxLossesPerDay: null,
                                              stopRule,
                                          },
                                )
                            }
                            type="button"
                        >
                            {isActive ? 'Clear' : 'Apply'}
                        </button>
                    );
                },
                enableSorting: false,
                header: '',
                id: 'apply',
            },
        ],
        [activePolicy, contractCap, onApply, pointValue, stopRule],
    );

    return (
        <Card
            className={cn('app-prop-calculator__ladder-lab', 'px-5 py-4')}
            id="ladder-lab"
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <FlaskConical className="size-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Ladder Lab</h3>
                    <InfoPopover title="Ladder Lab">
                        Searches every within-day risk ladder on a grid and
                        scores each one on three separate axes: expected days to
                        funded, cost per funded account, and pass rate. They
                        have different winners, so all three are shown rather
                        than blended into one score. Each rung is capped to the
                        cushion remaining before it, and ladders that clamp to
                        the same effective strategy are de-duplicated.
                    </InfoPopover>
                </div>
                <div className="flex items-center gap-2">
                    {state.isRunning ? (
                        <>
                            <span className="text-xs text-muted-foreground">
                                {state.completed}/{state.total} ·{' '}
                                {(state.elapsedMs / 1000).toFixed(0)}s elapsed
                                {state.etaMs === null
                                    ? ''
                                    : ` · ~${(state.etaMs / 1000).toFixed(0)}s left`}
                            </span>
                            <Button
                                className="h-7 px-2.5 text-xs"
                                onClick={cancel}
                                size="sm"
                                type="button"
                                variant="outline"
                            >
                                Cancel
                            </Button>
                        </>
                    ) : (
                        <Button
                            className="h-7 px-2.5 text-xs"
                            onClick={() =>
                                run({
                                    grid: { lo, max, slots, step },
                                    maxDays: maxEvalDays,
                                    plan,
                                    rrRatio,
                                    rungSizing,
                                    seed,
                                    sims,
                                    stopRule,
                                    winrate,
                                })
                            }
                            size="sm"
                            type="button"
                            variant="outline"
                        >
                            Run search
                        </Button>
                    )}
                </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                <NumberField label="Min rung" onChange={setLo} value={lo} />
                <NumberField label="Max rung" onChange={setMax} value={max} />
                <NumberField label="Step" onChange={setStep} value={step} />
                <NumberField label="Rungs" onChange={setSlots} value={slots} />
                <NumberField
                    label="Sims per ladder"
                    onChange={setSims}
                    value={sims}
                />
                <div className="flex flex-col gap-1">
                    <label
                        className="text-xs text-muted-foreground"
                        htmlFor="ladder-lab-instrument"
                    >
                        Instrument
                    </label>
                    <select
                        className="h-8 rounded-md border bg-transparent px-2 text-xs"
                        id="ladder-lab-instrument"
                        onChange={(event) =>
                            setInstrument(
                                event.target.value as '' | InstrumentSymbol,
                            )
                        }
                        value={instrument}
                    >
                        <option value="">Not set</option>
                        {ALL_INSTRUMENTS.map((spec) => (
                            <option key={spec.symbol} value={spec.symbol}>
                                {spec.symbol} (${spec.pointValue}/pt)
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-4">
                <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">
                        Day stop rule
                    </span>
                    <DayStopRulePicker
                        compact
                        onChange={setStopRule}
                        value={stopRule}
                    />
                </div>
                <label className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">
                        Unaffordable rung
                    </span>
                    <select
                        className="h-8 rounded-md border bg-transparent px-2 text-xs"
                        onChange={(event) =>
                            setSizingMode(event.target.value as RungSizing)
                        }
                        value={rungSizing}
                    >
                        <option value="capToCushion">Cap to cushion</option>
                        <option value="skipIfUnaffordable">Skip trade</option>
                    </select>
                </label>
            </div>

            {isAliasingRisk && (
                <p className="mt-3 text-xs text-amber-400">
                    A max rung above {formatCurrency(aliasingFrom)} is past the
                    point where ladders start aliasing to the same effective
                    strategy on this {formatCurrency(cushion)} cushion. They are
                    de-duplicated, so the grid stays honest, but the extra range
                    mostly adds compute rather than distinct strategies.
                </p>
            )}

            {state.error !== null && (
                <p className="mt-3 text-xs text-rose-400">{state.error}</p>
            )}

            {state.result && (
                <div className="mt-4 flex flex-col gap-5">
                    <p className="text-xs text-muted-foreground">
                        Scored {state.result.laddersScored} distinct ladders
                        from a {state.result.gridSize}-ladder grid (
                        {state.result.droppedAliasCount} aliases removed) in{' '}
                        {(state.elapsedMs / 1000).toFixed(1)}s.
                    </p>

                    <div>
                        <h4 className="mb-2 text-xs font-semibold">
                            Efficient frontier
                        </h4>
                        <LadderFrontierChartView
                            frontier={state.result.frontier}
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <h4 className="text-xs font-semibold">
                            Ranked ladders ({rows.length})
                        </h4>
                        <DataTable<LadderScore>
                            className="app-prop-calculator__ladder-table text-xs tabular-nums"
                            columns={columns}
                            data={rows}
                            initialSorting={[{ desc: false, id: 'days' }]}
                            pageSize={15}
                            rowClassName={(r) =>
                                activePolicy !== null &&
                                activePolicy.ladder.join(',') ===
                                    r.ladder.join(',')
                                    ? 'bg-emerald-500/10'
                                    : undefined
                            }
                            rowId={(r) => r.ladder.join(',')}
                        />
                    </div>
                </div>
            )}
        </Card>
    );
}

function NumberField({
    label,
    onChange,
    value,
}: {
    label: string;
    onChange: (value: number) => void;
    value: number;
}) {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{label}</span>
            <Input
                className="h-8"
                inputMode="numeric"
                onChange={(event) => {
                    const parsed = Number(event.target.value);
                    if (Number.isSafeInteger(parsed)) onChange(parsed);
                }}
                value={value}
            />
        </label>
    );
}
