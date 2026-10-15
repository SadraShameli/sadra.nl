'use client';

import { endOfDay, format, startOfDay, subDays } from 'date-fns';
import { Activity, Flame, Play, Trophy } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { type DateRange } from 'react-day-picker';

import {
    PR_KIND_ALL,
    PrFiltersToolbar,
    type PrRange,
} from '~/app/(app)/lifting/_components/shared/PrFiltersToolbar';
import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import {
    DataTable,
    DataTableAlign,
    type DataTableColumn,
} from '~/components/ui/DataTable';
import { EmptyState } from '~/components/ui/EmptyState';
import { Skeleton } from '~/components/ui/Skeleton';
import { WeightUnit } from '~/lib/lifting/format';
import { routes } from '~/lib/site/routes';
import { api, type RouterOutputs } from '~/trpc/react';

type PrRow =
    RouterOutputs['lifting']['analytics']['summaryHero']['recentPrs'][number];

export function TodayHero() {
    const summary = api.lifting.analytics.summaryHero.useQuery();
    const active = api.lifting.workout.getActive.useQuery();
    const settings = api.lifting.settings.get.useQuery();
    const unitWeight = settings.data?.unitWeight ?? 'kg';
    const utilities = api.useUtils();
    const start = api.lifting.workout.start.useMutation({
        onSuccess: () => utilities.lifting.workout.getActive.invalidate(),
    });
    const [prRange, setPrRange] = useState<PrRange>('all');
    const [prCustomRange, setPrCustomRange] = useState<DateRange | undefined>();
    const [prKindFilter, setPrKindFilter] = useState<string>(PR_KIND_ALL);

    const filteredPrs = useMemo(() => {
        let rows = summary.data?.recentPrs ?? [];
        if (prKindFilter !== PR_KIND_ALL) {
            rows = rows.filter((pr) => pr.kind === prKindFilter);
        }
        if (prCustomRange?.from) {
            const from = startOfDay(prCustomRange.from);
            const to = endOfDay(prCustomRange.to ?? prCustomRange.from);
            return rows.filter((pr) => {
                const d = new Date(pr.achievedAt);
                return d >= from && d <= to;
            });
        }
        if (prRange === 'all') return rows;
        const since = subDays(new Date(), Number(prRange));
        return rows.filter((pr) => new Date(pr.achievedAt) >= since);
    }, [summary.data?.recentPrs, prRange, prCustomRange, prKindFilter]);

    const handlePresetChange = (v: PrRange) => {
        setPrRange(v);
        setPrCustomRange(undefined);
    };

    const handleCustomRangeChange = (range: DateRange | undefined) => {
        setPrCustomRange(range);
        if (range?.from) setPrRange('all');
    };

    const isPrFiltersActive =
        prRange !== 'all' ||
        Boolean(prCustomRange?.from) ||
        prKindFilter !== PR_KIND_ALL;

    const resetPrFilters = () => {
        setPrRange('all');
        setPrCustomRange(undefined);
        setPrKindFilter(PR_KIND_ALL);
    };

    const prColumns = useMemo<DataTableColumn<PrRow>[]>(
        () => [
            {
                accessorKey: 'kind',
                cell: ({ row }) => (
                    <Badge variant="warning">
                        {row.original.kind.replaceAll('_', ' ')}
                    </Badge>
                ),
                header: 'Kind',
            },
            {
                cell: ({ row }) => (
                    <span className="font-semibold tabular-nums">
                        {WeightUnit.format(row.original.weightKg, unitWeight)} ×{' '}
                        {row.original.reps}
                    </span>
                ),
                header: 'Lift',
                id: 'lift',
                meta: { align: DataTableAlign.End },
            },
            {
                accessorKey: 'achievedAt',
                cell: ({ row }) => (
                    <span className="text-muted-foreground tabular-nums">
                        {format(
                            new Date(row.original.achievedAt),
                            'MMM d, yyyy',
                        )}
                    </span>
                ),
                header: 'Date',
                meta: { align: DataTableAlign.End },
            },
        ],
        [unitWeight],
    );

    return (
        <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Stat
                    icon={<Flame className="size-4" />}
                    label="Current streak"
                    value={
                        summary.data ? `${summary.data.currentStreak} wk` : null
                    }
                />
                <Stat
                    icon={<Activity className="size-4" />}
                    label="Sessions this week"
                    value={
                        summary.data
                            ? summary.data.sessionsThisWeek.toFixed(0)
                            : null
                    }
                />
                <Stat
                    icon={<Trophy className="size-4" />}
                    label="Recent PRs"
                    value={
                        summary.data
                            ? summary.data.recentPrs.length.toString()
                            : null
                    }
                />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                        Get started
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-3">
                        {active.isPending ? (
                            <Skeleton className="h-9 w-40" />
                        ) : active.data ? (
                            <Button asChild className="gap-2">
                                <Link href={routes.lifting.log}>
                                    <Activity className="size-4" />
                                    Resume {active.data.name ?? 'workout'}
                                </Link>
                            </Button>
                        ) : (
                            <Button
                                className="gap-2"
                                disabled={start.isPending}
                                onClick={() => start.mutate({})}
                                type="button"
                            >
                                <Play className="size-4" />
                                {start.isPending
                                    ? 'Starting…'
                                    : 'Start workout'}
                            </Button>
                        )}
                        <Button asChild type="button" variant="outline">
                            <Link href={routes.lifting.routines}>
                                From routine
                            </Link>
                        </Button>
                        <Button asChild type="button" variant="outline">
                            <Link href={routes.lifting.programs}>
                                Pick a program
                            </Link>
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                        <Trophy className="size-4" /> Recent PRs
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {summary.data?.recentPrs.length === 0 ? (
                        <EmptyState
                            description="Log a heavier set to set your first PR."
                            icon={Trophy}
                            title="No PRs yet"
                        />
                    ) : (
                        <DataTable
                            columns={prColumns}
                            data={filteredPrs}
                            emptyState={
                                <EmptyState
                                    description={
                                        prRange === 'all'
                                            ? 'Log a heavier set to set your first PR.'
                                            : 'No PRs in this date range.'
                                    }
                                    icon={Trophy}
                                    title="No PRs yet"
                                />
                            }
                            filterPlaceholder="Search PRs"
                            hasExternalFilters={isPrFiltersActive}
                            headerActions={
                                <PrFiltersToolbar
                                    customRange={prCustomRange}
                                    kind={prKindFilter}
                                    onCustomRangeChange={
                                        handleCustomRangeChange
                                    }
                                    onKindChange={setPrKindFilter}
                                    onRangeChange={handlePresetChange}
                                    range={prRange}
                                />
                            }
                            isLoading={summary.isLoading}
                            onResetFilters={resetPrFilters}
                            pageSize={null}
                            rowId={(r) => r.id}
                            showFilter
                            skeletonRows={3}
                        />
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function Stat({
    icon,
    label,
    value,
}: {
    icon: React.ReactNode;
    label: string;
    value: null | string;
}) {
    return (
        <Card className="gap-2 py-4">
            <CardContent>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {icon}
                    {label}
                </div>
                {value === null ? (
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
