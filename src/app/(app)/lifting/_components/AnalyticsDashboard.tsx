'use client';

import { eachDayOfInterval, format, getDay, subMonths } from 'date-fns';
import { CalendarRange } from 'lucide-react';
import { type ReactNode, useMemo } from 'react';

import { HEAT_LEVEL_CLASS } from '~/app/(app)/lifting/_components/shared/heatLevelClass';
import { PanelErrorBoundary } from '~/components/PanelErrorBoundary';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { EmptyState } from '~/components/ui/empty-state';
import { Progress } from '~/components/ui/progress';
import { Skeleton } from '~/components/ui/skeleton';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '~/components/ui/tooltip';
import { WeightUnit } from '~/lib/lifting/format';
import {
    MUSCLE_VALUES,
    type UnitWeight,
    type WeekStart,
} from '~/lib/lifting/types';
import { cn } from '~/lib/utilities';
import { api, type RouterOutputs } from '~/trpc/react';

export function AnalyticsDashboard() {
    const range = useMemo(() => {
        const to = new Date();
        const from = subMonths(to, 3);
        return { from, to };
    }, []);

    const volume = api.lifting.analytics.volumePerMuscle.useQuery(range);
    const consistency = api.lifting.analytics.consistency.useQuery({
        trailingWeeks: 4,
    });
    const heatmap = api.lifting.analytics.frequencyHeatmap.useQuery(range);
    const settings = api.lifting.settings.get.useQuery();
    const unitWeight = settings.data?.unitWeight ?? 'kg';
    const weekStart = settings.data?.weekStart ?? 'mon';

    return (
        <AnalyticsPanels
            consistency={consistency.data}
            heatmap={
                <FrequencyHeatmap
                    data={heatmap.data}
                    from={range.from}
                    isLoading={heatmap.isLoading}
                    to={range.to}
                    unitWeight={unitWeight}
                    weekStart={weekStart}
                />
            }
            unitWeight={unitWeight}
            volume={volume.data}
        />
    );
}

export function AnalyticsDashboardSkeleton() {
    return <AnalyticsPanels heatmap={<HeatmapSkeleton />} />;
}

function AnalyticsPanels({
    consistency,
    heatmap,
    unitWeight = 'kg',
    volume,
}: {
    readonly consistency?: RouterOutputs['lifting']['analytics']['consistency'];
    readonly heatmap: ReactNode;
    readonly unitWeight?: UnitWeight;
    readonly volume?: RouterOutputs['lifting']['analytics']['volumePerMuscle'];
}) {
    return (
        <div className="flex flex-col gap-6">
            <PanelErrorBoundary section="Training stats">
                <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <Stat
                        label="Current streak"
                        value={consistency && `${consistency.currentStreak} wk`}
                    />
                    <Stat
                        label="Longest streak"
                        value={consistency && `${consistency.longestStreak} wk`}
                    />
                    <Stat
                        label="Sessions / week"
                        value={consistency?.sessionsPerWeek.toFixed(1)}
                    />
                    <Stat
                        label="Tonnage (90d)"
                        value={
                            volume &&
                            WeightUnit.format(volume.tonnageKg, unitWeight)
                        }
                    />
                </section>
            </PanelErrorBoundary>

            <PanelErrorBoundary section="Sets per muscle">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                            Sets per muscle (last 90 days)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-col gap-2">
                            {MUSCLE_VALUES.map((m) => {
                                const sets = volume?.setsPerMuscle[m] ?? 0;
                                return (
                                    <div
                                        className="flex items-center gap-3"
                                        key={m}
                                    >
                                        <span className="w-24 text-xs text-muted-foreground capitalize">
                                            {m}
                                        </span>
                                        {volume ? (
                                            <>
                                                <Progress
                                                    className="h-2 flex-1"
                                                    value={Math.min(
                                                        100,
                                                        sets * 5,
                                                    )}
                                                />
                                                <span className="w-10 text-right text-xs tabular-nums">
                                                    {sets}
                                                </span>
                                            </>
                                        ) : (
                                            <>
                                                <Skeleton className="h-2 flex-1" />
                                                <Skeleton className="h-4 w-10" />
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            </PanelErrorBoundary>

            <PanelErrorBoundary section="Frequency heatmap">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                            Frequency heatmap
                        </CardTitle>
                    </CardHeader>
                    <CardContent>{heatmap}</CardContent>
                </Card>
            </PanelErrorBoundary>
        </div>
    );
}

function HeatmapSkeleton() {
    return <Skeleton className="h-24 w-full rounded-md" />;
}

const DAY_LABELS = ['Mon', 'Wed', 'Fri'] as const;

function FrequencyHeatmap({
    data,
    from,
    isLoading,
    to,
    unitWeight,
    weekStart,
}: {
    data: undefined | { date: string; tonnageKg: number }[];
    from: Date;
    isLoading: boolean;
    to: Date;
    unitWeight: UnitWeight;
    weekStart: WeekStart;
}) {
    const grid = useMemo(() => {
        if (!data) return null;
        const byDate = new Map(data.map((c) => [c.date, c.tonnageKg]));
        const days = eachDayOfInterval({ end: to, start: from });
        const cells = days.map((d) => ({
            date: format(d, 'yyyy-MM-dd'),
            tonnageKg: byDate.get(format(d, 'yyyy-MM-dd')) ?? 0,
        }));
        const max = Math.max(0, ...cells.map((c) => c.tonnageKg));
        const level = (kg: number): number => {
            if (kg <= 0 || max <= 0) return 0;
            const pct = kg / max;
            if (pct < 0.25) return 1;
            if (pct < 0.5) return 2;
            return pct < 0.75 ? 3 : 4;
        };
        const weeks: (null | {
            date: string;
            level: number;
            tonnageKg: number;
        })[][] = [];
        let week: (null | {
            date: string;
            level: number;
            tonnageKg: number;
        })[] = [];
        const first = days[0];
        if (first) {
            const raw = getDay(first);
            const dow = weekStart === 'sun' ? raw : (raw + 6) % 7;
            for (let index = 0; index < dow; index++) week.push(null);
        }
        for (const cell of cells) {
            week.push({ ...cell, level: level(cell.tonnageKg) });
            if (week.length !== 7) {
                continue;
            }

            weeks.push(week);
            week = [];
        }
        if (week.length > 0) {
            while (week.length < 7) week.push(null);
            weeks.push(week);
        }
        return { hasAny: max > 0, weeks };
    }, [data, from, to, weekStart]);

    if (isLoading) {
        return <HeatmapSkeleton />;
    }

    return grid?.hasAny ? (
        <TooltipProvider delayDuration={100}>
            <div className="flex flex-col gap-2">
                <div className="flex items-stretch gap-2">
                    <div className="flex flex-col justify-between py-0.5 text-[10px] text-muted-foreground">
                        {DAY_LABELS.map((d) => (
                            <span key={d}>{d}</span>
                        ))}
                    </div>
                    <div className="flex flex-1 gap-1">
                        {grid.weeks.map((week, wi) => (
                            <div
                                className="flex flex-1 flex-col gap-1"
                                key={wi}
                            >
                                {week.map((cell, di) =>
                                    cell ? (
                                        <Tooltip key={cell.date}>
                                            <TooltipTrigger asChild>
                                                <div
                                                    className={cn(
                                                        'aspect-square rounded-sm',
                                                        HEAT_LEVEL_CLASS[
                                                            cell.level
                                                        ],
                                                    )}
                                                />
                                            </TooltipTrigger>
                                            <TooltipContent
                                                className="text-xs"
                                                side="top"
                                            >
                                                {cell.date} ·{' '}
                                                {WeightUnit.format(
                                                    cell.tonnageKg,
                                                    unitWeight,
                                                )}
                                            </TooltipContent>
                                        </Tooltip>
                                    ) : (
                                        <div
                                            className="aspect-square"
                                            key={`pad-${wi}-${di}`}
                                        />
                                    ),
                                )}
                            </div>
                        ))}
                    </div>
                </div>
                <div className="flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                    <span>Less</span>
                    {HEAT_LEVEL_CLASS.map((c, index) => (
                        <span
                            className={cn('size-3 rounded-sm', c)}
                            key={index}
                        />
                    ))}
                    <span>More</span>
                </div>
            </div>
        </TooltipProvider>
    ) : (
        <EmptyState
            description="Log a workout to start filling out the heatmap."
            icon={CalendarRange}
            title="No activity yet"
        />
    );
}

function Stat({ label, value }: { label: string; value: string | undefined }) {
    return (
        <Card className="gap-2 py-4">
            <CardContent>
                <p className="text-xs text-muted-foreground">{label}</p>
                {value === undefined ? (
                    <Skeleton className="mt-1 h-8 w-16" />
                ) : (
                    <p className="mt-1 text-2xl font-bold tabular-nums">
                        {value}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
