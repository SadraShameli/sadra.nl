'use client';

import { Activity, Play, Trophy } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

import { PrFiltersToolbar } from '~/app/(app)/lifting/_components/shared/PrFiltersToolbar';
import { prTableColumns } from '~/app/(app)/lifting/_components/shared/prTableColumns';
import { usePrFilters } from '~/app/(app)/lifting/_components/shared/usePrFilters';
import { StatStrip, StatStripSize } from '~/components/StatStrip';
import { ToolPanel } from '~/components/ToolPanel';
import { Button } from '~/components/ui/button';
import { DataTable } from '~/components/ui/data-table';
import { EmptyState, NoMatchesState } from '~/components/ui/empty-state';
import { Skeleton } from '~/components/ui/skeleton';
import { routes } from '~/lib/site/routes';
import { api } from '~/trpc/react';

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

    const prColumns = useMemo(() => prTableColumns(unitWeight), [unitWeight]);

    return (
        <div className="flex flex-col gap-6">
            <StatStrip
                isLoading={summary.data === undefined}
                items={[
                    {
                        id: 'current-streak',
                        label: 'Current streak',
                        value:
                            summary.data && `${summary.data.currentStreak} wk`,
                    },
                    {
                        id: 'sessions-this-week',
                        label: 'Sessions this week',
                        value: summary.data?.sessionsThisWeek.toFixed(0),
                    },
                    {
                        id: 'recent-prs',
                        label: 'Recent PRs',
                        value: summary.data?.recentPrs.length.toString(),
                    },
                ]}
                size={StatStripSize.Large}
            />

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
                        emptyState={<NoMatchesState icon={Trophy} noun="PRs" />}
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
