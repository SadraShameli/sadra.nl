'use client';

import { useEffect, useRef, useState } from 'react';

import { Card } from '~/components/ui/Card';
import { type Plan, type SimInputs, simulate } from '~/lib/prop-calculator';
import { cn } from '~/lib/utils';

import { formatCompactCurrency, formatPercent } from './helpers';
import InfoPopover from './InfoPopover';
import { panelDescriptions } from './kpiDescriptions';

const WINRATES = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6] as const;
const RR_RATIOS = [1, 1.5, 2, 2.5, 3, 3.5, 4] as const;

interface Cell {
    monthlyNet: number;
    pass: number;
    rr: number;
    winrate: number;
}

interface HeatmapCellsProps {
    cells: Cell[];
    currentRR: number;
    currentWinrate: number;
    metric: 'net' | 'pass';
}

interface SensitivityHeatmapProps {
    baseInputs: SimInputs;
    currentRR: number;
    currentWinrate: number;
    plan: Plan;
}

export default function SensitivityHeatmap({
    baseInputs,
    currentRR,
    currentWinrate,
    plan,
}: SensitivityHeatmapProps) {
    const { cells, pending } = useSensitivityGrid(plan, baseInputs);

    return (
        <div className="grid gap-3 lg:grid-cols-2">
            <Card className="px-5 py-4">
                <div className="mb-3 flex items-baseline justify-between gap-2">
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
                    metric="pass"
                />
            </Card>
            <Card className="px-5 py-4">
                <div className="mb-3 flex items-baseline justify-between gap-2">
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
                    metric="net"
                />
            </Card>
        </div>
    );
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
}: HeatmapCellsProps) {
    let maxAbs = 0;
    if (metric === 'net') {
        for (const c of cells) {
            const abs = Math.abs(c.monthlyNet);
            if (abs > maxAbs) maxAbs = abs;
        }
    }

    const closestWinrate = nearest(currentWinrate, WINRATES);
    const closestRR = nearest(currentRR, RR_RATIOS);

    return (
        <div className="overflow-x-auto">
            <table className="text-[11px] tabular-nums">
                <thead>
                    <tr className="text-muted-foreground">
                        <th className="px-1 py-1 text-left font-medium">
                            ↓ Winrate / RR →
                        </th>
                        {RR_RATIOS.map((rr) => (
                            <th
                                className="px-1 py-1 text-center font-medium"
                                key={rr}
                            >
                                {rr}:1
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {WINRATES.map((winrate) => (
                        <tr key={winrate}>
                            <td className="px-1 py-1 text-muted-foreground">
                                {formatPercent(winrate, 0)}
                            </td>
                            {RR_RATIOS.map((rr) => {
                                const cell = cells.find(
                                    (c) => c.winrate === winrate && c.rr === rr,
                                );
                                const isCurrent =
                                    winrate === closestWinrate &&
                                    rr === closestRR;
                                const colorClass = cell
                                    ? metric === 'pass'
                                        ? colorForPass(cell.pass)
                                        : colorForNet(cell.monthlyNet, maxAbs)
                                    : '';
                                const display = cell
                                    ? metric === 'pass'
                                        ? formatPercent(cell.pass, 0)
                                        : formatCompactCurrency(cell.monthlyNet)
                                    : '';
                                const tooltip = cell
                                    ? `winrate ${formatPercent(winrate, 0)} · RR ${rr}:1\npass ${formatPercent(cell.pass)}\nmonthly net $${cell.monthlyNet.toFixed(0)}`
                                    : '';
                                return (
                                    <td
                                        className={cn(
                                            'h-9 w-14 px-0.5 py-0.5 text-center text-foreground transition-colors',
                                            colorClass,
                                            isCurrent &&
                                                'outline-2 -outline-offset-2 outline-primary',
                                        )}
                                        key={rr}
                                        title={tooltip}
                                    >
                                        {display}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function nearest<T extends number>(target: number, options: readonly T[]): T {
    return options.reduce((best, v) =>
        Math.abs(v - target) < Math.abs(best - target) ? v : best,
    );
}

function useDebouncedKey(inputs: SimInputs, delay: number): string {
    const key = JSON.stringify({
        act: inputs.discounts?.activationPercent ?? 0,
        attempts: inputs.maxAttempts ?? 1,
        commission: inputs.commissionPerRoundTrip ?? 0,
        copy: inputs.copyAccounts ?? 1,
        eval: inputs.discounts?.evalPercent ?? 0,
        firmId: inputs.plan.id,
        funded: inputs.fundedHorizonDays,
        max: inputs.maxEvalDays,
        risk: inputs.riskPerTrade,
        seed: inputs.seed,
        tpd: inputs.tradesPerDay,
        trials: inputs.trials,
    });
    const [debounced, setDebounced] = useState(key);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(key), delay);
        return () => clearTimeout(t);
    }, [key, delay]);
    return debounced;
}

function useSensitivityGrid(
    _plan: Plan,
    baseInputs: SimInputs,
): { cells: Cell[]; pending: boolean } {
    const [cells, setCells] = useState<Cell[]>([]);
    const [pending, setPending] = useState(false);
    const inputsRef = useRef(baseInputs);
    inputsRef.current = baseInputs;

    const debouncedKey = useDebouncedKey(baseInputs, 700);

    useEffect(() => {
        let cancelled = false;
        setPending(true);
        const handle = setTimeout(() => {
            const inputs = inputsRef.current;
            const trials = Math.min(300, inputs.trials);
            const out: Cell[] = [];
            for (const winrate of WINRATES) {
                for (const rr of RR_RATIOS) {
                    const result = simulate({
                        ...inputs,
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
            if (!cancelled) {
                setCells(out);
                setPending(false);
            }
        }, 0);
        return () => {
            cancelled = true;
            clearTimeout(handle);
        };
    }, [debouncedKey]);

    return { cells, pending };
}
