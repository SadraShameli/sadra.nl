'use client';

import { FlaskConical } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';

import { Button } from '~/components/ui/Button';
import { Card } from '~/components/ui/Card';
import { DataTable, type DataTableColumn } from '~/components/ui/DataTable';
import InfoPopover from '~/components/ui/InfoPopover';
import { Input } from '~/components/ui/Input';
import { formatCurrency, formatPercent, NOT_APPLICABLE } from '~/lib/format';
import {
    ALL_INSTRUMENTS,
    type DayPolicy,
    DEFAULT_RUNG_SIZING,
    defaultLadderGridMax,
    evalContractLimit,
    INSTRUMENTS,
    InstrumentSymbol,
    type LadderGridConfig,
    type LadderScore,
    ladderSum,
    MAX_LADDER_SLOTS,
    minStopPoints,
    resolvePositionSizing,
    RungSizing,
    type SimInputs,
} from '~/lib/prop-calculator';
import { SizingObjective } from '~/lib/prop-calculator/advisor';
import { RankingSurface } from '~/lib/prop-calculator/advisor/actions';
import { cn } from '~/lib/utilities';

import {
    useCalculatorActions,
    useCalculatorInputs,
    useLabSlots,
} from './CalculatorProvider';
import LadderFrontierChartView from './charts/LadderFrontierChartView';
import DayStopRulePicker from './DayStopRulePicker';
import { describeLadderIgnoredInputs } from './ladderIgnoredInputs';
import {
    displayedLadderSlot,
    initialLadderLabForm,
    isActiveLadderRow,
    labViewForSlot,
    LadderLabViewKind,
    type LadderRowAction,
    ladderRowAction,
    LadderRowActionKind,
    ladderSearchInputsFor,
    settledSlotEvent,
} from './ladderLabRestore';
import {
    type LadderDisplayInstrument,
    type LadderLabForm,
    LadderSlotEvent,
    ladderSlotFor,
} from './ladderResultSlot';
import {
    LadderRunPhase,
    type LadderSearchInputs,
    type LadderSearchState,
} from './ladderSearchTypes';
import { describeUnscorableLadderRun } from './ladderUnscorable';
import { CalculatorObjectiveChip } from './ObjectiveChip';
import {
    ladderObjectiveStar,
    ladderRungPlacements,
    riskTableObjective,
} from './objectiveRanking';
import {
    RUNG_SIZING_LABELS,
    RUNG_SIZING_OPTIONS,
    RUNG_SIZING_OUTCOMES,
    UNAFFORDABLE_RUNG_LABEL,
} from './rungSizingLabels';
import { useLadderSearch } from './useLadderSearch';

interface LadderLabPanelProperties {
    activePolicy: DayPolicy | null;
    baseInputs: SimInputs;
    onApply: (policy: DayPolicy | null) => void;
}

interface LatestLadderRun {
    displayInstrument: LadderDisplayInstrument;
    runInputs: LadderSearchInputs | null;
    search: LadderSearchState;
}

const instrumentChoiceSchema = z.union([
    z.literal(''),
    z.enum(InstrumentSymbol),
]);
const rungSizingSchema = z.enum(RungSizing);

export default function LadderLabPanel({
    activePolicy,
    baseInputs,
    onApply,
}: LadderLabPanelProperties) {
    const {
        idleDayProbability,
        instrument: sizingInstrument,
        maxAttempts,
        plan,
        rebuyLagDays,
        stopPoints,
    } = baseInputs;
    const ignoredInputsNote = describeLadderIgnoredInputs({
        idleDayProbability,
        maxAttempts,
        rebuyLagDays,
    });
    const cushion = plan.drawdown.amount;
    const positionSizing = resolvePositionSizing(sizingInstrument, stopPoints);
    const { ladderSlot } = useLabSlots();
    const { state: calculatorState } = useCalculatorInputs();
    const objectiveView = riskTableObjective(
        calculatorState.objective,
        RankingSurface.Ladder,
    );
    const { setRungSizing, writeLadderSlot } = useCalculatorActions();
    const activeRungSizing = baseInputs.rungSizing ?? DEFAULT_RUNG_SIZING;
    const [form, setForm] = useState<LadderLabForm>(() =>
        initialLadderLabForm(ladderSlot, cushion, activeRungSizing),
    );
    const {
        displayInstrument: instrument,
        grid: { lo, max, slots, step },
        rungSizing,
        sims,
        stopRule,
    } = form;
    const { cancel, run, runInputs, state } = useLadderSearch();

    const latestRun = useRef<LatestLadderRun>({
        displayInstrument: instrument,
        runInputs,
        search: state,
    });
    useEffect(() => {
        latestRun.current = {
            displayInstrument: instrument,
            runInputs,
            search: state,
        };
    }, [instrument, runInputs, state]);

    useEffect(() => {
        const event = settledSlotEvent(state.phase);
        if (event === null || runInputs === null) return;
        writeLadderSlot(
            event,
            ladderSlotFor(
                event,
                state,
                runInputs,
                latestRun.current.displayInstrument,
            ),
        );
    }, [runInputs, state, writeLadderSlot]);

    useEffect(() => {
        const latest = latestRun;
        return () => {
            const {
                displayInstrument,
                runInputs: inputs,
                search,
            } = latest.current;
            if (inputs === null) return;
            writeLadderSlot(
                LadderSlotEvent.Unmounted,
                ladderSlotFor(
                    LadderSlotEvent.Unmounted,
                    search,
                    inputs,
                    displayInstrument,
                ),
            );
        };
    }, [writeLadderSlot]);

    const currentInputs = useMemo(
        () => ladderSearchInputsFor(baseInputs, form),
        [baseInputs, form],
    );
    const displayedSlot = useMemo(
        () => displayedLadderSlot(state, runInputs, instrument, ladderSlot),
        [instrument, ladderSlot, runInputs, state],
    );
    const view = useMemo(
        () => labViewForSlot(displayedSlot, currentInputs),
        [currentInputs, displayedSlot],
    );

    function setGrid(patch: Partial<LadderGridConfig>) {
        setForm((current) => ({
            ...current,
            grid: { ...current.grid, ...patch },
        }));
    }

    const aliasingFrom = defaultLadderGridMax(cushion);
    const isAliasingRisk = max > aliasingFrom;
    const instrumentSpec = instrument === '' ? null : INSTRUMENTS[instrument];
    const pointValue = instrumentSpec?.pointValue ?? null;
    const contractCap =
        instrumentSpec === null
            ? null
            : evalContractLimit(plan.contractLimits, instrumentSpec.isMicro);
    const labPositionSizing = useMemo(
        () =>
            resolvePositionSizing(
                instrument === '' ? undefined : instrument,
                stopPoints,
            ),
        [instrument, stopPoints],
    );

    const scored =
        view.kind === LadderLabViewKind.Restored ||
        view.kind === LadderLabViewKind.InputsChanged
            ? view
            : null;
    const unscorableNote =
        scored === null ? null : describeUnscorableLadderRun(scored.result);
    const starKey = useMemo(
        () =>
            scored === null
                ? null
                : (ladderObjectiveStar(
                      scored.result,
                      objectiveView.effective,
                  )?.ladder.join(',') ?? null),
        [objectiveView.effective, scored],
    );
    const rows = useMemo(() => {
        const result = scored?.result;
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
    }, [scored?.result]);

    const columns = useMemo<DataTableColumn<LadderScore>[]>(
        () => [
            {
                accessorFn: (r) => r.ladder.join(' / '),
                cell: ({ row }) => (
                    <span className="font-mono">
                        {row.original.ladder.join(' / ')}
                        {row.original.ladder.join(',') === starKey && (
                            <span className="ml-1 text-emerald-400">★</span>
                        )}
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
                cell: ({ row }) => (
                    <WithStandardError
                        standardError={formatPercent(
                            row.original.passRateStandardError,
                            2,
                        )}
                        value={formatPercent(row.original.passRate)}
                    />
                ),
                header: 'Eval pass',
                id: 'pass',
            },
            {
                accessorFn: (r) => r.expectedDaysToFunded,
                cell: ({ row }) => (
                    <WithStandardError
                        standardError={row.original.expectedDaysToFundedStandardError.toFixed(
                            2,
                        )}
                        value={row.original.expectedDaysToFunded.toFixed(1)}
                    />
                ),
                header: 'Days to funded',
                id: 'days',
            },
            {
                accessorFn: (r) => r.costPerFunded,
                cell: ({ row }) => (
                    <WithStandardError
                        standardError={formatCurrency(
                            row.original.costPerFundedStandardError,
                            2,
                        )}
                        value={formatCurrency(row.original.costPerFunded)}
                    />
                ),
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
                            {stop === null
                                ? NOT_APPLICABLE
                                : `${stop.toFixed(1)} pt`}
                        </span>
                    );
                },
                header: 'Min stop',
                id: 'minStop',
            },
            ...(labPositionSizing === null
                ? []
                : [contractsColumn(labPositionSizing, contractCap)]),
            {
                cell: ({ row }) => (
                    <LadderRowButton
                        action={ladderRowAction(
                            view,
                            row.original,
                            activePolicy,
                            activeRungSizing,
                        )}
                        onApply={(policy, sizing) => {
                            onApply(policy);
                            setRungSizing(sizing);
                        }}
                        onClear={() => onApply(null)}
                    />
                ),
                enableSorting: false,
                header: '',
                id: 'apply',
            },
        ],
        [
            activePolicy,
            activeRungSizing,
            contractCap,
            labPositionSizing,
            onApply,
            pointValue,
            setRungSizing,
            starKey,
            view,
        ],
    );

    return (
        <Card
            className={cn(
                'app-prop-calculator__ladder-lab',
                'scroll-mt-26 px-5 py-4',
            )}
            id="ladder-lab"
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <FlaskConical className="size-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Ladder Lab</h3>
                    <InfoPopover title="Ladder Lab">
                        Searches every within-day risk ladder on a grid and
                        scores each one on three separate axes: expected days to
                        funded, cost per funded account, and eval pass rate.
                        They have different winners, so all three are shown
                        rather than blended into one score. Ladders that clamp
                        to the same effective strategy are de-duplicated. Each
                        rung follows the unaffordable rung choice:
                        {RUNG_SIZING_OPTIONS.map((option) => (
                            <span className="mt-1 block" key={option}>
                                {RUNG_SIZING_LABELS[option]}:{' '}
                                {RUNG_SIZING_OUTCOMES[option]}
                            </span>
                        ))}
                    </InfoPopover>
                </div>
                <div className="flex items-center gap-2">
                    {state.phase === LadderRunPhase.Running ? (
                        <>
                            <span className="text-xs text-muted-foreground">
                                {state.progress.completed}/
                                {state.progress.total} ·{' '}
                                {(state.progress.elapsedMs / 1000).toFixed(0)}s
                                elapsed
                                {state.progress.etaMs === null
                                    ? ''
                                    : ` · ~${(state.progress.etaMs / 1000).toFixed(0)}s left`}
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
                            onClick={() => run(currentInputs)}
                            size="sm"
                            type="button"
                            variant="outline"
                        >
                            Run search
                        </Button>
                    )}
                </div>
            </div>

            <CalculatorObjectiveChip className="mt-3" />

            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                <NumberField
                    label="Min rung"
                    onChange={(value) => setGrid({ lo: value })}
                    value={lo}
                />
                <NumberField
                    label="Max rung"
                    onChange={(value) => setGrid({ max: value })}
                    value={max}
                />
                <NumberField
                    label="Step"
                    onChange={(value) => setGrid({ step: value })}
                    value={step}
                />
                <NumberField
                    label="Rungs"
                    max={MAX_LADDER_SLOTS}
                    onChange={(value) => setGrid({ slots: value })}
                    value={slots}
                />
                <NumberField
                    label="Sims per ladder"
                    onChange={(value) =>
                        setForm((current) => ({ ...current, sims: value }))
                    }
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
                        onChange={(event) => {
                            const parsed = instrumentChoiceSchema.safeParse(
                                event.target.value,
                            );
                            if (parsed.success) {
                                setForm((current) => ({
                                    ...current,
                                    displayInstrument: parsed.data,
                                }));
                            }
                        }}
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
                        onChange={(value) =>
                            setForm((current) => ({
                                ...current,
                                stopRule: value,
                            }))
                        }
                        value={stopRule}
                    />
                </div>
                <label className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">
                        {UNAFFORDABLE_RUNG_LABEL}
                    </span>
                    <select
                        className="h-8 rounded-md border bg-transparent px-2 text-xs"
                        onChange={(event) => {
                            const parsed = rungSizingSchema.safeParse(
                                event.target.value,
                            );
                            if (parsed.success) {
                                setForm((current) => ({
                                    ...current,
                                    rungSizing: parsed.data,
                                }));
                            }
                        }}
                        value={rungSizing}
                    >
                        {RUNG_SIZING_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                                {RUNG_SIZING_LABELS[option]}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
                Apply also sets the unaffordable rung choice for every trade in
                the simulation, eval and funded, not only for this ladder.
            </p>

            <p className="mt-3 text-xs text-muted-foreground">
                {positionSizing === null
                    ? 'Contract limits are not applied: set an instrument and a stop in the trading inputs to cap each rung at the eval contract limit.'
                    : `Each rung is capped at the eval contract limit for ${positionSizing.instrument.symbol} with a ${positionSizing.stopPoints} pt stop, as in the simulation.`}
            </p>

            {ignoredInputsNote !== null && (
                <p className="mt-3 text-xs text-amber-400">
                    {ignoredInputsNote}
                </p>
            )}

            {isAliasingRisk && (
                <p className="mt-3 text-xs text-amber-400">
                    A max rung above {formatCurrency(aliasingFrom)} is past the
                    point where ladders start aliasing to the same effective
                    strategy on this {formatCurrency(cushion)} cushion. They are
                    de-duplicated, so the grid stays honest, but the extra range
                    mostly adds compute rather than distinct strategies.
                </p>
            )}

            {state.phase === LadderRunPhase.Failed && (
                <p className="mt-3 text-xs text-rose-400">{state.reason}</p>
            )}

            {view.kind === LadderLabViewKind.Cancelled && (
                <p className="mt-3 text-xs text-amber-400">{view.notice}</p>
            )}

            {scored && (
                <div className="mt-4 flex flex-col gap-5">
                    {scored.kind === LadderLabViewKind.InputsChanged && (
                        <p className="text-xs text-amber-400">
                            {scored.notice}
                        </p>
                    )}

                    <p className="text-xs text-muted-foreground">
                        Scored {scored.result.laddersScored} distinct ladders
                        from a {scored.result.gridSize}-ladder grid (
                        {scored.result.droppedAliasCount} aliases removed) in{' '}
                        {(scored.slot.result.progress.elapsedMs / 1000).toFixed(
                            1,
                        )}
                        s. The ± figures are one standard error of Monte Carlo
                        noise; rows within about 2 SE of each other are
                        statistically tied, so raise the sims per ladder to
                        separate them.
                    </p>

                    {unscorableNote !== null && (
                        <p className="text-xs text-amber-400">
                            {unscorableNote}
                        </p>
                    )}

                    <div>
                        <h4 className="mb-2 text-xs font-semibold">
                            Efficient frontier
                        </h4>
                        <LadderFrontierChartView
                            frontier={scored.result.frontier}
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <h4 className="text-xs font-semibold">
                            Ranked ladders ({rows.length})
                        </h4>
                        <p className="text-xs text-muted-foreground">
                            {ladderStarText(objectiveView.effective)}
                            {labPositionSizing === null
                                ? ''
                                : ' Contracts are display only: whole contracts at your stop, rounded down.'}
                        </p>
                        <DataTable<LadderScore>
                            className="app-prop-calculator__ladder-table text-xs tabular-nums"
                            columns={columns}
                            data={rows}
                            initialSorting={[{ desc: false, id: 'days' }]}
                            pageSize={15}
                            rowClassName={(r) =>
                                isActiveLadderRow(
                                    view,
                                    r,
                                    activePolicy,
                                    activeRungSizing,
                                )
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

function contractsColumn(
    positionSizing: NonNullable<ReturnType<typeof resolvePositionSizing>>,
    contractCap: null | number,
): DataTableColumn<LadderScore> {
    return {
        accessorFn: (r) =>
            ladderRungPlacements(r.ladder, positionSizing, contractCap)
                ?.map((placement) => placement.contracts)
                .join(' / ') ?? '',
        cell: ({ row }) => {
            const placements =
                ladderRungPlacements(
                    row.original.ladder,
                    positionSizing,
                    contractCap,
                ) ?? [];
            return (
                <span className="text-muted-foreground">
                    {placements
                        .map((placement) => placement.contracts)
                        .join(' / ')}{' '}
                    contracts,{' '}
                    {placements
                        .map((placement) =>
                            formatCurrency(placement.placedRisk),
                        )
                        .join(' / ')}{' '}
                    placed
                </span>
            );
        },
        header: 'Contracts at stop',
        id: 'contracts',
    };
}

function LadderRowButton({
    action,
    onApply,
    onClear,
}: {
    action: LadderRowAction;
    onApply: (policy: DayPolicy, rungSizing: RungSizing) => void;
    onClear: () => void;
}) {
    switch (action.kind) {
        case LadderRowActionKind.Apply: {
            return (
                <button
                    className="text-xs text-muted-foreground underline"
                    onClick={() => onApply(action.policy, action.rungSizing)}
                    type="button"
                >
                    Apply
                </button>
            );
        }
        case LadderRowActionKind.Clear: {
            return (
                <button
                    className="text-xs text-muted-foreground underline"
                    onClick={onClear}
                    type="button"
                >
                    Clear
                </button>
            );
        }
        case LadderRowActionKind.Unavailable: {
            return (
                <button
                    className="text-xs text-muted-foreground/50"
                    disabled
                    title="Run the search again on the current inputs to apply a ladder"
                    type="button"
                >
                    Apply
                </button>
            );
        }
    }
}

function ladderStarText(objective: SizingObjective): string {
    switch (objective) {
        case SizingObjective.CycleCash: {
            return 'The star marks the cheapest ladder per funded account, an eval-stage proxy for cycle cash.';
        }
        case SizingObjective.MonthlyNet:
        case SizingObjective.RuinFirst: {
            return 'The star marks the fastest ladder to funded, an eval-stage proxy for monthly net.';
        }
    }
}

function NumberField({
    label,
    max,
    onChange,
    value,
}: {
    label: string;
    max?: number;
    onChange: (value: number) => void;
    value: number;
}) {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{label}</span>
            <Input
                className="h-8"
                inputMode="numeric"
                max={max}
                onChange={(event) => {
                    const parsed = Number(event.target.value);
                    if (
                        Number.isSafeInteger(parsed) &&
                        (max === undefined || parsed <= max)
                    ) {
                        onChange(parsed);
                    }
                }}
                value={value}
            />
        </label>
    );
}

function WithStandardError({
    standardError,
    value,
}: {
    standardError: string;
    value: string;
}) {
    return (
        <span>
            {value}
            <span className="text-muted-foreground"> ± {standardError}</span>
        </span>
    );
}
