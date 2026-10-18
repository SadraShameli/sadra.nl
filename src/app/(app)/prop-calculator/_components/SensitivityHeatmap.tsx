'use client';

import { useMemo } from 'react';

import { ToolPanel } from '~/components/ToolPanel';
import {
    DataTable,
    DataTableAlign,
    type DataTableColumn,
    DataTableNarrowLayout,
} from '~/components/ui/data-table';
import { HEAT_STEP_CLASSES, HeatScale } from '~/components/ui/heat-scale';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '~/components/ui/tooltip';
import {
    formatCompactCurrency,
    formatCurrency,
    formatPercent,
} from '~/lib/format';
import { type SimInputs, simulate } from '~/lib/prop-calculator';
import { simInputsSizingIssue } from '~/lib/prop-calculator/simulator';
import { cn } from '~/lib/utilities';

import { ComputationId } from './ComputationId';
import { panelDescriptions } from './kpiDescriptions';
import { simInputsCacheKey, SimInputsKeyField } from './simInputsCacheKey';
import { SimulationFailureNotice } from './SimulationFailureNotice';
import { useDebouncedComputation } from './useDebouncedSimulation';

enum SensitivityMetric {
    EvalPass = 'eval-pass',
    EvPerAttempt = 'ev-per-attempt',
    FundedSurvival = 'funded-survive',
    MonthlyNet = 'net',
}

const EV_PER_ATTEMPT_DESCRIPTION =
    'Expected value per attempt (pass probability x funded value over the funded horizon, minus attempt cost) across the same winrate x reward-to-risk grid, labelled per attempt: it ignores how long an attempt takes and is not the ranking objective. Pairs with the monthly net heatmap to spot where a small per-attempt edge still compounds into a strong monthly result.';

export interface Cell {
    evalPass: number;
    evPerAttempt: number;
    fundedSurvival: number;
    monthlyNet: number;
    rr: number;
    winrate: number;
}

interface HeatmapRow {
    cellsByRr: Map<number, Cell>;
    winrate: number;
}

const WINRATES = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6] as const;
const RR_RATIOS = [1, 1.5, 2, 2.5, 3, 3.5, 4] as const;
const DEBOUNCE_MS = 700;
const MAX_TRIALS = 300;
const HEATMAP_CORNER_HEADER = 'WR ↓ RR →';
const HEATMAP_TABLE_CLASS = cn(
    'app-prop-calculator__sensitivity-table',
    'text-xs tabular-nums',
    'max-md:[&_td]:px-1',
    'max-md:[&_tr>*:first-child]:sticky max-md:[&_tr>*:first-child]:left-0 max-md:[&_tr>*:first-child]:z-10 max-md:[&_tr>*:first-child]:bg-background max-md:[&_tr>*:first-child]:px-2',
);

interface HeatLegendProperties {
    high: string;
    low: string;
}

interface HeatmapCardProperties {
    cells: Cell[];
    currentRR: number;
    currentWinrate: number;
    description: string;
    metric: SensitivityMetric;
    pending: boolean;
    title: string;
}

interface HeatmapCellsProperties {
    cells: Cell[];
    currentRR: number;
    currentWinrate: number;
    metric: SensitivityMetric;
    scale: HeatScale;
}

interface SensitivityHeatmapProperties {
    baseInputs: SimInputs;
    currentRR: number;
    currentWinrate: number;
}

export default function SensitivityHeatmap({
    baseInputs,
    currentRR,
    currentWinrate,
}: SensitivityHeatmapProperties) {
    const { cells, error, pending } = useSensitivityGrid(baseInputs);

    if (error !== null) return <SimulationFailureNotice message={error} />;

    return (
        <div
            className={cn(
                'app-prop-calculator__sensitivity-heatmap',
                'grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]',
            )}
        >
            <HeatmapCard
                cells={cells}
                currentRR={currentRR}
                currentWinrate={currentWinrate}
                description={panelDescriptions.sensitivityPass}
                metric={SensitivityMetric.EvalPass}
                pending={pending}
                title="Eval pass sensitivity"
            />
            <HeatmapCard
                cells={cells}
                currentRR={currentRR}
                currentWinrate={currentWinrate}
                description={panelDescriptions.sensitivityFundedSurvival}
                metric={SensitivityMetric.FundedSurvival}
                pending={pending}
                title="Funded survive sensitivity"
            />
            <HeatmapCard
                cells={cells}
                currentRR={currentRR}
                currentWinrate={currentWinrate}
                description={panelDescriptions.sensitivityNet}
                metric={SensitivityMetric.MonthlyNet}
                pending={pending}
                title="Monthly net sensitivity"
            />
            <HeatmapCard
                cells={cells}
                currentRR={currentRR}
                currentWinrate={currentWinrate}
                description={EV_PER_ATTEMPT_DESCRIPTION}
                metric={SensitivityMetric.EvPerAttempt}
                pending={pending}
                title="EV per attempt sensitivity"
            />
        </div>
    );
}

function buildCacheKey(inputs: Omit<SimInputs, 'riskPerTrade'>): string {
    return simInputsCacheKey(inputs, {
        omit: [SimInputsKeyField.RrRatio, SimInputsKeyField.Winrate],
    });
}

function cellDisplay(cell: Cell, metric: SensitivityMetric): string {
    return formatMetricValue(metricValue(cell, metric), metric);
}

function formatMetricValue(value: number, metric: SensitivityMetric): string {
    switch (metric) {
        case SensitivityMetric.EvalPass:
        case SensitivityMetric.FundedSurvival: {
            return formatPercent(value, 0);
        }
        case SensitivityMetric.EvPerAttempt:
        case SensitivityMetric.MonthlyNet: {
            return formatCompactCurrency(value);
        }
    }
}

function HeatLegend({ high, low }: HeatLegendProperties) {
    return (
        <span className="app-prop-calculator__heat-legend flex items-center gap-2 text-xs tabular-nums">
            <span data-heat-legend-end>{low}</span>
            <span
                aria-label={`Tile scale from ${low}, nearest the card, to ${high}, the strongest camel`}
                className="flex h-2 w-24 overflow-hidden rounded-full border border-line-faint"
                role="img"
            >
                {HEAT_STEP_CLASSES.map((stepClassName) => (
                    <span
                        className={cn('flex-1', stepClassName)}
                        key={stepClassName}
                    />
                ))}
            </span>
            <span data-heat-legend-end>{high}</span>
        </span>
    );
}

function HeatmapCard({
    cells,
    currentRR,
    currentWinrate,
    description,
    metric,
    pending,
    title,
}: HeatmapCardProperties) {
    const scale = useMemo(() => metricScale(cells, metric), [cells, metric]);
    return (
        <ToolPanel
            className={`app-prop-calculator__sensitivity-${metric}`}
            description={
                cells.length === 0 ? undefined : (
                    <HeatLegend
                        high={formatMetricValue(scale.high, metric)}
                        low={formatMetricValue(scale.low, metric)}
                    />
                )
            }
            info={description}
            isComputing={pending}
            title={title}
            titleAs="h3"
        >
            <HeatmapCells
                cells={cells}
                currentRR={currentRR}
                currentWinrate={currentWinrate}
                metric={metric}
                scale={scale}
            />
        </ToolPanel>
    );
}

function HeatmapCells({
    cells,
    currentRR,
    currentWinrate,
    metric,
    scale,
}: HeatmapCellsProperties) {
    const rows = useMemo<HeatmapRow[]>(
        () =>
            WINRATES.map((winrate) => {
                const cellsByRr = new Map<number, Cell>();
                for (const c of cells) {
                    if (c.winrate === winrate) cellsByRr.set(c.rr, c);
                }
                return { cellsByRr, winrate };
            }),
        [cells],
    );

    const closestWinrate = nearest(currentWinrate, WINRATES);
    const closestRR = nearest(currentRR, RR_RATIOS);

    const columns = useMemo<DataTableColumn<HeatmapRow>[]>(() => {
        const cols: DataTableColumn<HeatmapRow>[] = [
            {
                cell: ({ row }) => (
                    <span className="text-muted-foreground">
                        {formatPercent(row.original.winrate, 0)}
                    </span>
                ),
                header: HEATMAP_CORNER_HEADER,
                id: 'winrate',
                meta: { isRowHeader: true },
            },
        ];
        for (const rr of RR_RATIOS) {
            cols.push({
                cell: ({ row }) => {
                    const cell = row.original.cellsByRr.get(rr);
                    const isCurrent =
                        row.original.winrate === closestWinrate &&
                        rr === closestRR;
                    const display = cell ? cellDisplay(cell, metric) : '';
                    const tooltip = cell
                        ? `winrate ${formatPercent(row.original.winrate, 0)} · RR ${rr}:1\neval pass ${formatPercent(cell.evalPass)}\nfunded survive ${formatPercent(cell.fundedSurvival)}\nmonthly net ${formatCurrency(cell.monthlyNet)}\nEV per attempt ${formatCurrency(cell.evPerAttempt)}`
                        : '';
                    if (!cell) return <span className="flex h-9 w-12" />;
                    const value = metricValue(cell, metric);
                    return (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span
                                    className={cn(
                                        'flex h-9 w-12 items-center justify-center rounded-sm text-ink transition-colors',
                                        scale.tileClassName(value),
                                        isCurrent &&
                                            'outline-2 -outline-offset-2 outline-ink',
                                    )}
                                    data-heat-step={scale.step(value)}
                                >
                                    {display}
                                </span>
                            </TooltipTrigger>
                            <TooltipContent className="whitespace-pre-line">
                                {tooltip}
                            </TooltipContent>
                        </Tooltip>
                    );
                },
                header: `${rr}:1`,
                id: `rr-${rr}`,
                meta: { align: DataTableAlign.Center },
            });
        }
        return cols;
    }, [closestRR, closestWinrate, metric, scale]);

    return (
        <DataTable<HeatmapRow>
            columns={columns}
            data={rows}
            isLoading={cells.length === 0}
            narrowLayout={DataTableNarrowLayout.Scroll}
            pageSize={null}
            rowId={(r) => String(r.winrate)}
            skeletonRows={WINRATES.length}
            tableClassName={HEATMAP_TABLE_CLASS}
        />
    );
}

function metricScale(
    cells: readonly Cell[],
    metric: SensitivityMetric,
): HeatScale {
    switch (metric) {
        case SensitivityMetric.EvalPass:
        case SensitivityMetric.FundedSurvival: {
            return HeatScale.PROBABILITY;
        }
        case SensitivityMetric.EvPerAttempt:
        case SensitivityMetric.MonthlyNet: {
            return HeatScale.spanning(
                cells.map((cell) => metricValue(cell, metric)),
            );
        }
    }
}

function metricValue(cell: Cell, metric: SensitivityMetric): number {
    switch (metric) {
        case SensitivityMetric.EvalPass: {
            return cell.evalPass;
        }
        case SensitivityMetric.EvPerAttempt: {
            return cell.evPerAttempt;
        }
        case SensitivityMetric.FundedSurvival: {
            return cell.fundedSurvival;
        }
        case SensitivityMetric.MonthlyNet: {
            return cell.monthlyNet;
        }
    }
}

function nearest<T extends number>(target: number, options: readonly T[]): T {
    return options.reduce((best, v) =>
        Math.abs(v - target) < Math.abs(best - target) ? v : best,
    );
}

function useSensitivityGrid(baseInputs: SimInputs): {
    cells: Cell[];
    error: null | string;
    pending: boolean;
} {
    const key = buildCacheKey(baseInputs);
    const {
        error,
        pending,
        result: cells,
    } = useDebouncedComputation(
        ComputationId.Sensitivity,
        key,
        DEBOUNCE_MS,
        () => {
            const trials = Math.min(MAX_TRIALS, baseInputs.trials);
            const out: Cell[] = [];
            for (const winrate of WINRATES) {
                for (const rr of RR_RATIOS) {
                    const result = simulate({
                        ...baseInputs,
                        rrRatio: rr,
                        trials,
                        winrate,
                    });
                    out.push({
                        evalPass: result.evalPassProbability,
                        evPerAttempt: result.expectedNetPerAttempt,
                        fundedSurvival: result.fundedSurvivalProbability,
                        monthlyNet: result.expectedMonthlyNet,
                        rr,
                        winrate,
                    });
                }
            }
            return out;
        },
        [],
        simInputsSizingIssue(baseInputs),
    );

    return { cells, error, pending };
}
