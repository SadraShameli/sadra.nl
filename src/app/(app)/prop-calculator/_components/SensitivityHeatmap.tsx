'use client';

import { useMemo } from 'react';

import { ToolPanel } from '~/components/ToolPanel';
import {
    DataTable,
    DataTableAlign,
    type DataTableColumn,
    DataTablePhoneLayout,
} from '~/components/ui/data-table';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '~/components/ui/tooltip';
import { formatCompactCurrency, formatPercent } from '~/lib/format';
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

interface HeatmapCardProperties {
    cells: Cell[];
    currentRR: number;
    currentWinrate: number;
    description: string;
    legend: string;
    metric: SensitivityMetric;
    pending: boolean;
    title: string;
}

interface HeatmapCellsProperties {
    cells: Cell[];
    currentRR: number;
    currentWinrate: number;
    metric: SensitivityMetric;
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
                legend="camel = robust, dark = unlikely"
                metric={SensitivityMetric.EvalPass}
                pending={pending}
                title="Eval pass sensitivity"
            />
            <HeatmapCard
                cells={cells}
                currentRR={currentRR}
                currentWinrate={currentWinrate}
                description={panelDescriptions.sensitivityFundedSurvival}
                legend="camel = robust, dark = unlikely"
                metric={SensitivityMetric.FundedSurvival}
                pending={pending}
                title="Funded survive sensitivity"
            />
            <HeatmapCard
                cells={cells}
                currentRR={currentRR}
                currentWinrate={currentWinrate}
                description={panelDescriptions.sensitivityNet}
                legend="camel = profit, dark = loss"
                metric={SensitivityMetric.MonthlyNet}
                pending={pending}
                title="Monthly net sensitivity"
            />
            <HeatmapCard
                cells={cells}
                currentRR={currentRR}
                currentWinrate={currentWinrate}
                description={EV_PER_ATTEMPT_DESCRIPTION}
                legend="camel = profit, dark = loss; per attempt"
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

function cellClassName(
    cell: Cell,
    metric: SensitivityMetric,
    maxAbs: number,
): string {
    switch (metric) {
        case SensitivityMetric.EvalPass: {
            return colorForPass(cell.evalPass);
        }
        case SensitivityMetric.EvPerAttempt: {
            return colorForNet(cell.evPerAttempt, maxAbs);
        }
        case SensitivityMetric.FundedSurvival: {
            return colorForPass(cell.fundedSurvival);
        }
        case SensitivityMetric.MonthlyNet: {
            return colorForNet(cell.monthlyNet, maxAbs);
        }
    }
}

function cellDisplay(cell: Cell, metric: SensitivityMetric): string {
    switch (metric) {
        case SensitivityMetric.EvalPass: {
            return formatPercent(cell.evalPass, 0);
        }
        case SensitivityMetric.EvPerAttempt: {
            return formatCompactCurrency(cell.evPerAttempt);
        }
        case SensitivityMetric.FundedSurvival: {
            return formatPercent(cell.fundedSurvival, 0);
        }
        case SensitivityMetric.MonthlyNet: {
            return formatCompactCurrency(cell.monthlyNet);
        }
    }
}

function colorForNet(net: number, maxAbs: number): string {
    if (maxAbs <= 0) return 'bg-muted/30';
    const ratio = Math.max(-1, Math.min(1, net / maxAbs));
    if (ratio >= 0.6) return 'bg-success/70';
    if (ratio >= 0.3) return 'bg-success/45';
    if (ratio > 0.05) return 'bg-success/25';
    if (ratio >= -0.05) return 'bg-muted/30';
    if (ratio >= -0.3) return 'bg-destructive/30';
    return ratio >= -0.6 ? 'bg-destructive/45' : 'bg-destructive/65';
}

function colorForPass(pass: number): string {
    if (pass >= 0.8) return 'bg-success/70';
    if (pass >= 0.65) return 'bg-success/45';
    if (pass >= 0.5) return 'bg-warning/45';
    if (pass >= 0.35) return 'bg-warning/30';
    return pass >= 0.2 ? 'bg-destructive/40' : 'bg-destructive/60';
}

function HeatmapCard({
    cells,
    currentRR,
    currentWinrate,
    description,
    legend,
    metric,
    pending,
    title,
}: HeatmapCardProperties) {
    return (
        <ToolPanel
            className={`app-prop-calculator__sensitivity-${metric}`}
            description={pending ? 'computing…' : legend}
            info={description}
            title={title}
            titleAs="h3"
        >
            <HeatmapCells
                cells={cells}
                currentRR={currentRR}
                currentWinrate={currentWinrate}
                metric={metric}
            />
        </ToolPanel>
    );
}

function HeatmapCells({
    cells,
    currentRR,
    currentWinrate,
    metric,
}: HeatmapCellsProperties) {
    const maxAbs = useMemo(() => {
        if (
            metric !== SensitivityMetric.MonthlyNet &&
            metric !== SensitivityMetric.EvPerAttempt
        ) {
            return 0;
        }
        const valueOf =
            metric === SensitivityMetric.MonthlyNet
                ? (c: Cell) => c.monthlyNet
                : (c: Cell) => c.evPerAttempt;
        let m = 0;
        for (const c of cells) {
            const abs = Math.abs(valueOf(c));
            if (abs > m) m = abs;
        }
        return m;
    }, [cells, metric]);

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
                header: '↓ Winrate / RR →',
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
                    const colorClass = cell
                        ? cellClassName(cell, metric, maxAbs)
                        : '';
                    const display = cell ? cellDisplay(cell, metric) : '';
                    const tooltip = cell
                        ? `winrate ${formatPercent(row.original.winrate, 0)} · RR ${rr}:1\neval pass ${formatPercent(cell.evalPass)}\nfunded survive ${formatPercent(cell.fundedSurvival)}\nmonthly net $${cell.monthlyNet.toFixed(0)}\nEV per attempt $${cell.evPerAttempt.toFixed(0)}`
                        : '';
                    if (!cell) return <span className="flex h-9 w-12" />;
                    return (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span
                                    className={cn(
                                        'flex h-9 w-12 items-center justify-center rounded-sm text-foreground transition-colors',
                                        colorClass,
                                        isCurrent &&
                                            'outline-2 -outline-offset-2 outline-primary',
                                    )}
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
    }, [closestRR, closestWinrate, maxAbs, metric]);

    return (
        <DataTable<HeatmapRow>
            columns={columns}
            data={rows}
            isLoading={rows.length === 0}
            pageSize={null}
            phoneLayout={DataTablePhoneLayout.Scroll}
            rowId={(r) => String(r.winrate)}
            skeletonRows={WINRATES.length}
            tableClassName="text-[11px] tabular-nums"
        />
    );
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
