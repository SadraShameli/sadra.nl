'use client';

import { useEffect, useState } from 'react';

import { type Plan, simulate, type SimInputs } from '~/lib/prop-calculator';
import { cn } from '~/lib/utils';

import { Card } from '~/components/ui/Card';

import { formatCompactCurrency, formatPercent } from './helpers';
import InfoPopover from './InfoPopover';
import { panelDescriptions } from './kpiDescriptions';

const WINRATES = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6] as const;
const RR_RATIOS = [1, 1.5, 2, 2.5, 3, 3.5, 4] as const;

interface SensitivityHeatmapProps {
    plan: Plan;
    baseInputs: SimInputs;
    currentWinrate: number;
    currentRR: number;
}

interface Cell {
    winrate: number;
    rr: number;
    pass: number;
    monthlyNet: number;
}

function colorForPass(pass: number): string {
    if (pass >= 0.8) return 'bg-emerald-500/70';
    if (pass >= 0.65) return 'bg-emerald-500/45';
    if (pass >= 0.5) return 'bg-yellow-500/45';
    if (pass >= 0.35) return 'bg-yellow-500/30';
    if (pass >= 0.2) return 'bg-rose-500/40';
    return 'bg-rose-500/60';
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

function useSensitivityGrid(
    plan: Plan,
    baseInputs: SimInputs,
): { cells: Cell[]; pending: boolean } {
    const [cells, setCells] = useState<Cell[]>([]);
    const [pending, setPending] = useState(false);

    const debouncedKey = useDebouncedKey(baseInputs, 700);

    useEffect(() => {
        let cancelled = false;
        setPending(true);
        const handle = setTimeout(() => {
            const trials = Math.min(300, baseInputs.trials);
            const out: Cell[] = [];
            for (const winrate of WINRATES) {
                for (const rr of RR_RATIOS) {
                    const result = simulate({
                        ...baseInputs,
                        trials,
                        winrate,
                        rrRatio: rr,
                    });
                    out.push({
                        winrate,
                        rr,
                        pass: result.passProbability,
                        monthlyNet: result.expectedMonthlyNet,
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
    }, [debouncedKey, plan, baseInputs]);

    return { cells, pending };
}

interface HeatmapCellsProps {
    cells: Cell[];
    metric: 'pass' | 'net';
    currentWinrate: number;
    currentRR: number;
}

function HeatmapCells({
    cells,
    metric,
    currentWinrate,
    currentRR,
}: HeatmapCellsProps) {
    let maxAbs = 0;
    if (metric === 'net') {
        for (const c of cells) {
            const abs = Math.abs(c.monthlyNet);
            if (abs > maxAbs) maxAbs = abs;
        }
    }

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
                                key={rr}
                                className="px-1 py-1 text-center font-medium"
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
                                    Math.abs(winrate - currentWinrate) < 0.02 &&
                                    Math.abs(rr - currentRR) < 0.06;
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
                                        key={rr}
                                        className={cn(
                                            'h-9 w-14 px-0.5 py-0.5 text-center text-foreground transition-colors',
                                            colorClass,
                                            isCurrent &&
                                                'outline-2 -outline-offset-2 outline-primary',
                                        )}
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

export default function SensitivityHeatmap({
    plan,
    baseInputs,
    currentWinrate,
    currentRR,
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
                    metric="pass"
                    currentWinrate={currentWinrate}
                    currentRR={currentRR}
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
                    metric="net"
                    currentWinrate={currentWinrate}
                    currentRR={currentRR}
                />
            </Card>
        </div>
    );
}

function useDebouncedKey(inputs: SimInputs, delay: number): string {
    const key = JSON.stringify({
        firmId: inputs.plan.id,
        risk: inputs.riskPerTrade,
        tpd: inputs.tradesPerDay,
        max: inputs.maxEvalDays,
        funded: inputs.fundedHorizonDays,
        seed: inputs.seed,
        commission: inputs.commissionPerRoundTrip ?? 0,
        attempts: inputs.maxAttempts ?? 1,
        eval: inputs.discounts?.evalPercent ?? 0,
        act: inputs.discounts?.activationPercent ?? 0,
    });
    const [debounced, setDebounced] = useState(key);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(key), delay);
        return () => clearTimeout(t);
    }, [key, delay]);
    return debounced;
}
