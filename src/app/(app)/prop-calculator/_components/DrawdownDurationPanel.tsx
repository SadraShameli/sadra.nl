'use client';

import { useMemo } from 'react';

import { Card } from '~/components/ui/Card';
import { type SimOutputs } from '~/lib/prop-calculator';
import { cn } from '~/lib/utils';

import { formatDays, formatPercent } from './helpers';
import InfoPopover from './InfoPopover';

interface DrawdownDurationPanelProps {
    result: SimOutputs;
}

interface DdEpisode {
    durationDays: number;
    depthPct: number;
    recovered: boolean;
    recoveryDays: number | null;
}

function analyzeEquityCurve(path: number[]): {
    underwaterPct: number;
    episodes: DdEpisode[];
} {
    if (path.length === 0) return { underwaterPct: 0, episodes: [] };

    let peak = path[0] ?? 0;
    let inDD = false;
    let ddStart = 0;
    let ddTrough = peak;
    let ddTroughIdx = 0;
    let underwaterDays = 0;
    const episodes: DdEpisode[] = [];

    for (let i = 0; i < path.length; i++) {
        const b = path[i] ?? 0;
        if (b > peak) peak = b;

        if (b < peak) {
            underwaterDays++;
            if (!inDD) {
                inDD = true;
                ddStart = i;
                ddTrough = b;
                ddTroughIdx = i;
            } else if (b < ddTrough) {
                ddTrough = b;
                ddTroughIdx = i;
            }
        } else if (inDD) {
            episodes.push({
                durationDays: i - ddStart,
                depthPct: peak > 0 ? (peak - ddTrough) / peak : 0,
                recovered: true,
                recoveryDays: i - ddTroughIdx,
            });
            inDD = false;
        }
    }

    if (inDD) {
        episodes.push({
            durationDays: path.length - ddStart,
            depthPct: peak > 0 ? (peak - ddTrough) / peak : 0,
            recovered: false,
            recoveryDays: null,
        });
    }

    return {
        underwaterPct: underwaterDays / path.length,
        episodes,
    };
}

function avg(nums: number[]): number {
    return nums.length === 0
        ? 0
        : nums.reduce((s, v) => s + v, 0) / nums.length;
}

function StatCard({
    label,
    value,
    sub,
    valueClass,
}: {
    label: string;
    value: string;
    sub?: string;
    valueClass?: string;
}) {
    return (
        <div className="flex flex-col gap-1 rounded-md border border-border/50 bg-muted/20 px-3 py-2.5">
            <span className="text-[11px] text-muted-foreground">{label}</span>
            <span
                className={cn(
                    'font-mono text-lg leading-none font-bold tabular-nums',
                    valueClass,
                )}
            >
                {value}
            </span>
            {sub && (
                <span className="text-[10px] text-muted-foreground">{sub}</span>
            )}
        </div>
    );
}

export default function DrawdownDurationPanel({
    result,
}: DrawdownDurationPanelProps) {
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
            const { underwaterPct, episodes } = analyzeEquityCurve(curve);
            underwaterPcts.push(underwaterPct);
            episodesPerPath.push(episodes.length);
            allEpisodes.push(...episodes);
            for (const ep of episodes) {
                if (ep.recovered && ep.recoveryDays !== null) {
                    recoveryTimes.push(ep.recoveryDays);
                    if (ep.recoveryDays < ep.durationDays * 0.4) {
                        vShapeCount++;
                    }
                    totalWithEpisodes++;
                }
            }
        }

        const durations = allEpisodes.map((e) => e.durationDays);
        const depths = allEpisodes.map((e) => e.depthPct);

        return {
            avgUnderwaterPct: avg(underwaterPcts),
            avgEpisodesPerPath: avg(episodesPerPath),
            avgDuration: avg(durations),
            maxDuration: durations.length > 0 ? Math.max(...durations) : 0,
            avgDepth: avg(depths),
            avgRecovery: avg(recoveryTimes),
            vShapePct:
                totalWithEpisodes > 0 ? vShapeCount / totalWithEpisodes : 0,
            totalEpisodes: allEpisodes.length,
            sampleSize: curves.length,
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
        <Card className="px-5 py-5">
            <div className="mb-4 flex items-center gap-2">
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
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    <StatCard
                        label="Time underwater"
                        value={formatPercent(m.avgUnderwaterPct)}
                        sub="avg % of days below peak"
                        valueClass={underwaterClass}
                    />
                    <StatCard
                        label="DD episodes / path"
                        value={m.avgEpisodesPerPath.toFixed(1)}
                        sub={`${m.totalEpisodes} total across ${m.sampleSize} paths`}
                    />
                    <StatCard
                        label="Avg DD duration"
                        value={formatDays(m.avgDuration)}
                        sub={`max ${formatDays(m.maxDuration)}`}
                    />
                    <StatCard
                        label="Avg DD depth"
                        value={formatPercent(m.avgDepth)}
                        sub="mean peak-to-trough"
                    />
                    <StatCard
                        label="Avg recovery time"
                        value={
                            m.avgRecovery > 0 ? formatDays(m.avgRecovery) : '—'
                        }
                        sub="from trough to new peak"
                        valueClass={recoveryClass}
                    />
                    <StatCard
                        label="V-shape episodes"
                        value={formatPercent(m.vShapePct)}
                        sub="fast recovery (&lt; 40% of dur.)"
                        valueClass={vShapeClass}
                    />
                </div>

                <div>
                    <p className="mb-2 text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase">
                        Recovery tax (loss needs more gain to break even)
                    </p>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs tabular-nums">
                            <thead>
                                <tr className="border-b border-border/40 text-left text-muted-foreground">
                                    <th className="py-1.5 pr-8 font-medium">
                                        Drawdown
                                    </th>
                                    <th className="py-1.5 pr-8 font-medium">
                                        Recovery needed
                                    </th>
                                    <th className="py-1.5 font-medium">
                                        Gain-to-break-even
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {[5, 10, 15, 20, 25, 33].map((ddPct) => {
                                    const recovery = ddPct / (100 - ddPct);
                                    return (
                                        <tr
                                            key={ddPct}
                                            className={cn(
                                                'border-b border-border/20',
                                                m.avgDepth * 100 >= ddPct - 2 &&
                                                    m.avgDepth * 100 <=
                                                        ddPct + 2
                                                    ? 'bg-muted/30 font-semibold'
                                                    : '',
                                            )}
                                        >
                                            <td className="py-1.5 pr-8">
                                                −{ddPct}%
                                            </td>
                                            <td className="py-1.5 pr-8 text-muted-foreground">
                                                needs +
                                                {(recovery * 100).toFixed(1)}%
                                            </td>
                                            <td
                                                className={cn(
                                                    'py-1.5',
                                                    recovery < 0.12
                                                        ? 'text-emerald-400'
                                                        : recovery < 0.25
                                                          ? 'text-amber-400'
                                                          : 'text-rose-400',
                                                )}
                                            >
                                                {(recovery * 100).toFixed(1)}%
                                                gain required
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </Card>
    );
}
