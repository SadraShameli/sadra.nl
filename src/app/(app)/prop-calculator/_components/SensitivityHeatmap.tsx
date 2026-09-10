'use client';

import { useMemo } from 'react';

import { Card } from '~/components/ui/Card';
import { DataTable, type DataTableColumn } from '~/components/ui/DataTable';
import InfoPopover from '~/components/ui/InfoPopover';
import { formatCompactCurrency, formatPercent } from '~/lib/format';
import { type SimInputs, simulate } from '~/lib/prop-calculator';
import { cn } from '~/lib/utilities';

import { panelDescriptions } from './kpiDescriptions';
import { simInputsCacheKey, SimInputsKeyField } from './simInputsCacheKey';
import { useDebouncedComputation } from './useDebouncedSimulation';

enum SensitivityMetric {
    MonthlyNet = 'net',
    Pass = 'pass',
}

interface HeatmapRow {
    cellsByRr: Map<number, Cell>;
    winrate: number;
}

const WINRATES = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6] as const;
const RR_RATIOS = [1, 1.5, 2, 2.5, 3, 3.5, 4] as const;
const DEBOUNCE_MS = 700;
const MAX_TRIALS = 300;

interface Cell {
    monthlyNet: number;
    pass: number;
    rr: number;
    winrate: number;
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
    const { cells, pending } = useSensitivityGrid(baseInputs);

    return (
        <div
            className={cn(
                'app-prop-calculator__sensitivity-heatmap',
                'grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]',
            )}
        >
            <Card
                className={cn(
                    'app-prop-calculator__sensitivity-pass',
                    'min-w-0 px-5 py-4',
                )}
            >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold">
                            Pass% sensitivity
                        </h3>
                        <InfoPopover title="Pass% sensitivity">
                            {panelDescriptions.sensitivityPass}
                        </InfoPopover>
                    </div>
                    <span className="text-xs text-muted-foreground">
                        {pending
                            ? 'computing…'
                            : 'red = unlikely, green = robust'}
                    </span>
                </div>
                <HeatmapCells
                    cells={cells}
                    currentRR={currentRR}
                    currentWinrate={currentWinrate}
                    metric={SensitivityMetric.Pass}
                />
            </Card>
            <Card
                className={cn(
                    'app-prop-calculator__sensitivity-net',
                    'min-w-0 px-5 py-4',
                )}
            >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold">
                            Monthly net sensitivity
                        </h3>
                        <InfoPopover title="Monthly net sensitivity">
                            {panelDescriptions.sensitivityNet}
                        </InfoPopover>
                    </div>
                    <span className="text-xs text-muted-foreground">
                        {pending
                            ? 'computing…'
                            : 'red = losing $, green = profit'}
                    </span>
                </div>
                <HeatmapCells
                    cells={cells}
                    currentRR={currentRR}
                    currentWinrate={currentWinrate}
                    metric={SensitivityMetric.MonthlyNet}
                />
            </Card>
        </div>
    );
}

function buildCacheKey(inputs: Omit<SimInputs, 'riskPerTrade'>): string {
    return simInputsCacheKey(inputs, {
        omit: [SimInputsKeyField.RrRatio, SimInputsKeyField.Winrate],
    });
}

function colorForNet(net: number, maxAbs: number): string {
    if (maxAbs <= 0) return 'bg-muted/30';
    const ratio = Math.max(-1, Math.min(1, net / maxAbs));
    if (ratio >= 0.6) return 'bg-emerald-500/70';
    if (ratio >= 0.3) return 'bg-emerald-500/45';
    if (ratio > 0.05) return 'bg-emerald-500/25';
    if (ratio >= -0.05) return 'bg-muted/30';
    if (ratio >= -0.3) return 'bg-rose-500/30';
    if (ratio >= -0.6) return 'bg-rose-500/45';
    return 'bg-rose-500/65';
}

function colorForPass(pass: number): string {
    if (pass >= 0.8) return 'bg-emerald-500/70';
    if (pass >= 0.65) return 'bg-emerald-500/45';
    if (pass >= 0.5) return 'bg-yellow-500/45';
    if (pass >= 0.35) return 'bg-yellow-500/30';
    if (pass >= 0.2) return 'bg-rose-500/40';
    return 'bg-rose-500/60';
}

function HeatmapCells({
    cells,
    currentRR,
    currentWinrate,
    metric,
}: HeatmapCellsProperties) {
    const maxAbs = useMemo(() => {
        if (metric !== SensitivityMetric.MonthlyNet) return 0;
        let m = 0;
        for (const c of cells) {
            const abs = Math.abs(c.monthlyNet);
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
                        ? metric === SensitivityMetric.Pass
                            ? colorForPass(cell.pass)
                            : colorForNet(cell.monthlyNet, maxAbs)
                        : '';
                    const display = cell
                        ? metric === SensitivityMetric.Pass
                            ? formatPercent(cell.pass, 0)
                            : formatCompactCurrency(cell.monthlyNet)
                        : '';
                    const tooltip = cell
                        ? `winrate ${formatPercent(row.original.winrate, 0)} · RR ${rr}:1\npass ${formatPercent(cell.pass)}\nmonthly net $${cell.monthlyNet.toFixed(0)}`
                        : '';
                    return (
                        <span
                            className={cn(
                                'flex h-9 w-14 items-center justify-center rounded-sm text-foreground transition-colors',
                                colorClass,
                                isCurrent &&
                                    'outline-2 -outline-offset-2 outline-primary',
                            )}
                            title={tooltip}
                        >
                            {display}
                        </span>
                    );
                },
                header: () => <span className="block text-center">{rr}:1</span>,
                id: `rr-${rr}`,
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
    pending: boolean;
} {
    const key = buildCacheKey(baseInputs);
    const { pending, result: cells } = useDebouncedComputation<Cell[]>(
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
                        monthlyNet: result.expectedMonthlyNet,
                        pass: result.passProbability,
                        rr,
                        winrate,
                    });
                }
            }
            return out;
        },
        [],
    );

    return { cells, pending };
}
