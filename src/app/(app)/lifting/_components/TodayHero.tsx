'use client';

import { format } from 'date-fns';
import { Activity, Flame, Play, Trophy } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

import { PrFiltersToolbar } from '~/app/(app)/lifting/_components/shared/PrFiltersToolbar';
import { usePrFilters } from '~/app/(app)/lifting/_components/shared/usePrFilters';
import { ToolPanel } from '~/components/ToolPanel';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import {
    DataTable,
    DataTableAlign,
    type DataTableColumn,
} from '~/components/ui/data-table';
import { EmptyState } from '~/components/ui/empty-state';
import { Skeleton } from '~/components/ui/skeleton';
import { WeightUnit } from '~/lib/lifting/format';
import { PrRangePreset } from '~/lib/lifting/pr-filters';
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
    const prFilters = usePrFilters(summary.data?.recentPrs);

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

            <ToolPanel title="Get started">
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
                            {start.isPending ? 'Starting…' : 'Start workout'}
                        </Button>
                    )}
                    <Button asChild type="button" variant="outline">
                        <Link href={routes.lifting.routines}>From routine</Link>
                    </Button>
                    <Button asChild type="button" variant="outline">
                        <Link href={routes.lifting.programs}>
                            Pick a program
                        </Link>
                    </Button>
                </div>
            </ToolPanel>

            <ToolPanel title="Recent PRs">
                {summary.data?.recentPrs.length === 0 ? (
                    <EmptyState
                        description="Log a heavier set to set your first PR."
                        icon={Trophy}
                        title="No PRs yet"
                    />
                ) : (
                    <DataTable
                        columns={prColumns}
                        data={prFilters.filteredRows}
                        emptyState={
                            <EmptyState
                                description={
                                    prFilters.range === PrRangePreset.All
                                        ? 'Log a heavier set to set your first PR.'
                                        : 'No PRs in this date range.'
                                }
                                icon={Trophy}
                                title="No PRs yet"
                            />
                        }
                        filterPlaceholder="Search PRs"
                        hasExternalFilters={prFilters.isActive}
                        headerActions={<PrFiltersToolbar filters={prFilters} />}
                        isLoading={summary.isLoading}
                        onResetFilters={prFilters.reset}
                        pageSize={null}
                        rowId={(r) => r.id}
                        showFilter
                        skeletonRows={3}
                    />
                )}
            </ToolPanel>
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
