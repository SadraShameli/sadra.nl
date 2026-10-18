'use client';

import { ChartNoAxesColumn } from 'lucide-react';
import { useMemo } from 'react';

import {
    recoveryTimeBench,
    underwaterBench,
    vShapeBench,
} from '~/app/(app)/prop-calculator/_components/drawdownBench';
import { PanelSubheading } from '~/components/PanelSubheading';
import { StatStrip } from '~/components/StatStrip';
import { DataTable, type DataTableColumn } from '~/components/ui/data-table';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';
import { formatDays, formatPercent } from '~/lib/format';
import { type SimOutputs } from '~/lib/prop-calculator';
import { mean } from '~/lib/prop-calculator/stats';
import { cn } from '~/lib/utilities';

import { benchCaption } from './benchCaption';
import { CaptionedFigure } from './CaptionedFigure';
import { recoveryTaxBench } from './recoveryTaxBench';
import { ValueOrMissing } from './ValueOrMissing';

const NEAR_AVERAGE_DEPTH_TEXT = 'near your average depth';

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
            const recovery = tallyRecoveredEpisodes(episodes);
            recoveryTimes.push(...recovery.recoveryTimes);
            vShapeCount += recovery.vShapeCount;
            totalWithEpisodes += recovery.totalWithEpisodes;
        }

        const durations = allEpisodes.map((episode) => episode.durationDays);
        const depths = allEpisodes.map((episode) => episode.depthPct);

        return {
            avgDepth: mean(depths),
            avgDuration: mean(durations),
            avgEpisodesPerPath: mean(episodesPerPath),
            avgRecovery: mean(recoveryTimes),
            avgUnderwaterPct: mean(underwaterPcts),
            maxDuration: durations.length > 0 ? Math.max(...durations) : 0,
            recoveredEpisodes: totalWithEpisodes,
            sampleSize: curves.length,
            totalEpisodes: allEpisodes.length,
            vShapePct:
                totalWithEpisodes > 0 ? vShapeCount / totalWithEpisodes : 0,
        };
    }, [result]);

    if (!m) {
        return (
            <EmptyState
                description="The run kept no sample equity curves, so there are no drawdowns to measure."
                icon={ChartNoAxesColumn}
                size={EmptyStateSize.Compact}
                title="No equity curves"
            />
        );
    }

    const hasRecoveries = m.recoveredEpisodes > 0;

    return (
        <div className="app-prop-calculator__drawdown-duration flex flex-col gap-5">
            <StatStrip
                items={[
                    {
                        caption: benchCaption(
                            'avg % of days below peak',
                            underwaterBench(m.avgUnderwaterPct),
                        ),
                        id: 'time-underwater',
                        label: 'Time underwater',
                        value: formatPercent(m.avgUnderwaterPct),
                    },
                    {
                        caption: `${m.totalEpisodes} total across ${m.sampleSize} paths`,
                        id: 'episodes-per-path',
                        label: 'DD episodes / path',
                        value: m.avgEpisodesPerPath.toFixed(1),
                    },
                    {
                        caption: (
                            <>
                                max{' '}
                                <ValueOrMissing
                                    value={formatDays(m.maxDuration)}
                                />
                            </>
                        ),
                        id: 'avg-duration',
                        label: 'Avg DD duration',
                        value: (
                            <ValueOrMissing value={formatDays(m.avgDuration)} />
                        ),
                    },
                    {
                        caption: 'mean peak-to-trough',
                        id: 'avg-depth',
                        label: 'Avg DD depth',
                        value: formatPercent(m.avgDepth),
                    },
                    {
                        caption: benchCaption(
                            'from trough to new peak',
                            hasRecoveries
                                ? recoveryTimeBench(m.avgRecovery)
                                : null,
                        ),
                        id: 'avg-recovery',
                        label: 'Avg recovery time',
                        value: (
                            <ValueOrMissing value={formatDays(m.avgRecovery)} />
                        ),
                    },
                    {
                        caption: benchCaption(
                            'fast recovery (< 40% of dur.)',
                            hasRecoveries ? vShapeBench(m.vShapePct) : null,
                        ),
                        id: 'v-shape',
                        label: 'V-shape episodes',
                        value: formatPercent(m.vShapePct),
                    },
                ]}
            />

            <div className="flex flex-col gap-2">
                <PanelSubheading>
                    Recovery tax (loss needs more gain to break even)
                </PanelSubheading>
                <RecoveryTaxTable avgDepth={m.avgDepth} />
            </div>
        </div>
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
    const columns = useMemo<DataTableColumn<RecoveryRow>[]>(
        () => [
            {
                accessorFn: (r) => r.ddPct,
                cell: ({ row }) => (
                    <CaptionedFigure
                        caption={
                            row.original.near ? NEAR_AVERAGE_DEPTH_TEXT : null
                        }
                        figure={`−${row.original.ddPct}%`}
                    />
                ),
                header: 'Drawdown',
                id: 'dd',
                meta: { isRowHeader: true },
            },
            {
                accessorFn: (r) => r.recovery,
                cell: ({ row }) => (
                    <CaptionedFigure
                        caption={recoveryTaxBench(row.original.recovery)}
                        figure={`${(row.original.recovery * 100).toFixed(1)}% gain required`}
                    />
                ),
                header: 'Gain to break even',
                id: 'gain',
            },
        ],
        [],
    );
    return (
        <DataTable<RecoveryRow>
            columns={columns}
            data={rows}
            pageSize={null}
            rowId={(r) => String(r.ddPct)}
            tableClassName={cn(
                'app-prop-calculator__recovery-tax-table',
                'text-xs tabular-nums',
            )}
        />
    );
}

function tallyRecoveredEpisodes(episodes: readonly DdEpisode[]): {
    recoveryTimes: number[];
    totalWithEpisodes: number;
    vShapeCount: number;
} {
    const recoveryTimes: number[] = [];
    let vShapeCount = 0;
    let totalWithEpisodes = 0;

    const recovered = episodes.filter(
        (episode): episode is DdEpisode & { recoveryDays: number } =>
            episode.recovered && episode.recoveryDays !== null,
    );

    for (const episode of recovered) {
        recoveryTimes.push(episode.recoveryDays);
        if (episode.recoveryDays < episode.durationDays * 0.4) {
            vShapeCount++;
        }

        totalWithEpisodes++;
    }

    return { recoveryTimes, totalWithEpisodes, vShapeCount };
}
