'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';

import { Card, CardContent } from '~/components/ui/Card';
import { DataTable } from '~/components/ui/DataTable';
import InfoPopover from '~/components/ui/InfoPopover';
import { formatDays, formatPercent } from '~/lib/format';
import { type SimOutputs } from '~/lib/prop-calculator';
import { cn } from '~/lib/utils';

interface DdEpisode {
    depthPct: number;
    durationDays: number;
    recovered: boolean;
    recoveryDays: null | number;
}

interface DrawdownDurationPanelProperties {
    result: SimOutputs;
}

interface RecoveryRow {
    ddPct: number;
    near: boolean;
    recovery: number;
}

export default function DrawdownDurationPanel({
    result,
}: DrawdownDurationPanelProperties) {
    const m = useMemo(() => {
        const curves = result.sampleEquityCurves;
        if (curves.length === 0) return null;

        const allEpisodes: DdEpisode[] = [];
        const underwaterPcts: number[] = [];
        const recoveryTimes: number[] = [];
        const episodesPerPath: number[] = [];
        let vShapeCount = 0;
        let totalWithEpisodes = 0;

        for (const curve of curves) {
            const { episodes, underwaterPct } = analyzeEquityCurve(curve);
            underwaterPcts.push(underwaterPct);
            episodesPerPath.push(episodes.length);
            allEpisodes.push(...episodes);
            for (const ep of episodes) {
                if (!ep.recovered || ep.recoveryDays === null) {
                    continue;
                }

                recoveryTimes.push(ep.recoveryDays);
                if (ep.recoveryDays < ep.durationDays * 0.4) {
                    vShapeCount++;
                }
                totalWithEpisodes++;
            }
        }

        const durations = allEpisodes.map((e) => e.durationDays);
        const depths = allEpisodes.map((e) => e.depthPct);

        return {
            avgDepth: avg(depths),
            avgDuration: avg(durations),
            avgEpisodesPerPath: avg(episodesPerPath),
            avgRecovery: avg(recoveryTimes),
            avgUnderwaterPct: avg(underwaterPcts),
            maxDuration: durations.length > 0 ? Math.max(...durations) : 0,
            sampleSize: curves.length,
            totalEpisodes: allEpisodes.length,
            vShapePct:
                totalWithEpisodes > 0 ? vShapeCount / totalWithEpisodes : 0,
        };
    }, [result]);

    if (!m) return null;

    const underwaterClass =
        m.avgUnderwaterPct < 0.2
            ? 'text-emerald-400'
            : m.avgUnderwaterPct < 0.4
              ? 'text-amber-400'
              : 'text-rose-400';

    const recoveryClass =
        m.avgRecovery < 3
            ? 'text-emerald-400'
            : m.avgRecovery < 10
              ? 'text-amber-400'
              : 'text-rose-400';

    const vShapeClass =
        m.vShapePct > 0.6
            ? 'text-emerald-400'
            : m.vShapePct > 0.3
              ? 'text-amber-400'
              : 'text-rose-400';

    return (
        <Card
            className={cn(
                'app-prop-calculator__drawdown-duration',
                'px-5 py-5',
            )}
        >
            <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">
                    Drawdown Duration & Recovery
                </h3>
                <InfoPopover title="Drawdown Duration & Recovery">
                    Analyses the 50 sampled equity paths to measure how long
                    drawdown episodes last and how quickly they recover. Time
                    underwater is the share of trading days spent below a prior
                    peak. V-shape episodes recover in under 40% of their total
                    duration — the faster that number, the less psychological
                    and capital drag the strategy produces. Recovery tax shows
                    the extra return required to get back to breakeven after
                    typical drawdowns.
                </InfoPopover>
            </div>

            <div className="flex flex-col gap-5">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                    <StatCard
                        label="Time underwater"
                        sub="avg % of days below peak"
                        value={formatPercent(m.avgUnderwaterPct)}
                        valueClass={underwaterClass}
                    />
                    <StatCard
                        label="DD episodes / path"
                        sub={`${m.totalEpisodes} total across ${m.sampleSize} paths`}
                        value={m.avgEpisodesPerPath.toFixed(1)}
                    />
                    <StatCard
                        label="Avg DD duration"
                        sub={`max ${formatDays(m.maxDuration)}`}
                        value={formatDays(m.avgDuration)}
                    />
                    <StatCard
                        label="Avg DD depth"
                        sub="mean peak-to-trough"
                        value={formatPercent(m.avgDepth)}
                    />
                    <StatCard
                        label="Avg recovery time"
                        sub="from trough to new peak"
                        value={
                            m.avgRecovery > 0 ? formatDays(m.avgRecovery) : '—'
                        }
                        valueClass={recoveryClass}
                    />
                    <StatCard
                        label="V-shape episodes"
                        sub="fast recovery (&lt; 40% of dur.)"
                        value={formatPercent(m.vShapePct)}
                        valueClass={vShapeClass}
                    />
                </div>

                <div>
                    <p className="mb-2 text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase">
                        Recovery tax (loss needs more gain to break even)
                    </p>
                    <RecoveryTaxTable avgDepth={m.avgDepth} />
                </div>
            </div>
        </Card>
    );
}

function analyzeEquityCurve(path: number[]): {
    episodes: DdEpisode[];
    underwaterPct: number;
} {
    if (path.length === 0) return { episodes: [], underwaterPct: 0 };

    let peak = path[0] ?? 0;
    let isInDD = false;
    let ddStart = 0;
    let ddTrough = peak;
    let ddTroughIndex = 0;
    let underwaterDays = 0;
    const episodes: DdEpisode[] = [];

    for (const [index, element] of path.entries()) {
        const b = element;
        if (b > peak) peak = b;

        if (b < peak) {
            underwaterDays++;
            if (!isInDD) {
                isInDD = true;
                ddStart = index;
                ddTrough = b;
                ddTroughIndex = index;
            } else if (b < ddTrough) {
                ddTrough = b;
                ddTroughIndex = index;
            }
        } else if (isInDD) {
            episodes.push({
                depthPct: peak > 0 ? (peak - ddTrough) / peak : 0,
                durationDays: index - ddStart,
                recovered: true,
                recoveryDays: index - ddTroughIndex,
            });
            isInDD = false;
        }
    }

    if (isInDD) {
        episodes.push({
            depthPct: peak > 0 ? (peak - ddTrough) / peak : 0,
            durationDays: path.length - ddStart,
            recovered: false,
            recoveryDays: null,
        });
    }

    return {
        episodes,
        underwaterPct: underwaterDays / path.length,
    };
}

function avg(nums: number[]): number {
    return nums.length === 0
        ? 0
        : nums.reduce((s, v) => s + v, 0) / nums.length;
}

function RecoveryTaxTable({ avgDepth }: { avgDepth: number }) {
    const rows = useMemo<RecoveryRow[]>(
        () =>
            [5, 10, 15, 20, 25, 33].map((ddPct) => ({
                ddPct,
                near:
                    avgDepth * 100 >= ddPct - 2 && avgDepth * 100 <= ddPct + 2,
                recovery: ddPct / (100 - ddPct),
            })),
        [avgDepth],
    );
    const columns = useMemo<ColumnDef<RecoveryRow>[]>(
        () => [
            {
                accessorFn: (r) => r.ddPct,
                cell: ({ row }) => `−${row.original.ddPct}%`,
                header: 'Drawdown',
                id: 'dd',
            },
            {
                accessorFn: (r) => r.recovery,
                cell: ({ row }) => (
                    <span className="text-muted-foreground">
                        needs +{(row.original.recovery * 100).toFixed(1)}%
                    </span>
                ),
                header: 'Recovery needed',
                id: 'recovery',
            },
            {
                accessorFn: (r) => r.recovery,
                cell: ({ row }) => {
                    const r = row.original.recovery;
                    return (
                        <span
                            className={
                                r < 0.12
                                    ? 'text-emerald-400'
                                    : r < 0.25
                                      ? 'text-amber-400'
                                      : 'text-rose-400'
                            }
                        >
                            {(r * 100).toFixed(1)}% gain required
                        </span>
                    );
                },
                header: 'Gain-to-break-even',
                id: 'gain',
            },
        ],
        [],
    );
    return (
        <DataTable<RecoveryRow, unknown>
            columns={columns}
            data={rows}
            pageSize={null}
            rowClassName={(r) =>
                r.near ? 'bg-muted/30 font-semibold' : undefined
            }
            rowId={(r) => String(r.ddPct)}
            tableClassName={cn(
                'app-prop-calculator__recovery-tax-table',
                'text-xs tabular-nums',
            )}
        />
    );
}

function StatCard({
    label,
    sub,
    value,
    valueClass,
}: {
    label: string;
    sub?: string;
    value: string;
    valueClass?: string;
}) {
    return (
        <Card className="gap-1 py-2.5">
            <CardContent className="flex flex-col gap-1 px-3">
                <span className="text-[11px] text-muted-foreground">
                    {label}
                </span>
                <span
                    className={cn(
                        'font-mono text-lg leading-none font-bold tabular-nums',
                        valueClass,
                    )}
                >
                    {value}
                </span>
                {sub && (
                    <span className="text-[10px] text-muted-foreground">
                        {sub}
                    </span>
                )}
            </CardContent>
        </Card>
    );
}
