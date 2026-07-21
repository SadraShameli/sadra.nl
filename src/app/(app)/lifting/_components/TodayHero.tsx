'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { endOfDay, format, startOfDay, subDays } from 'date-fns';
import { Activity, Flame, Play, Trophy } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { type DateRange } from 'react-day-picker';

import { Alert, AlertDescription, AlertTitle } from '~/components/ui/Alert';
import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import { ClearFiltersButton } from '~/components/ui/ClearFiltersButton';
import { DataTable } from '~/components/ui/DataTable';
import { DateRangePicker } from '~/components/ui/DatePicker';
import { EmptyState } from '~/components/ui/EmptyState';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
import { WeightUnit } from '~/lib/lifting/format';
import { PR_KIND_VALUES } from '~/lib/lifting/types';
import { routes } from '~/lib/site/routes';
import { api, type RouterOutputs } from '~/trpc/react';

type PrRow =
    RouterOutputs['lifting']['analytics']['summaryHero']['recentPrs'][number];

const PR_RANGE_VALUES = ['all', '7', '30', '90', '365'] as const;
type PrRange = (typeof PR_RANGE_VALUES)[number];
const PR_RANGE_LABEL: Record<PrRange, string> = {
    '7': 'Last 7 days',
    '30': 'Last 30 days',
    '90': 'Last 90 days',
    '365': 'Last year',
    all: 'All time',
};

const PR_KIND_ALL = '__all__';

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

    const prColumns = useMemo<ColumnDef<PrRow>[]>(
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
                    <span className="block text-right font-semibold tabular-nums">
                        {WeightUnit.format(row.original.weightKg, unitWeight)} ×{' '}
                        {row.original.reps}
                    </span>
                ),
                header: () => <span className="block text-right">Lift</span>,
                id: 'lift',
            },
            {
                accessorKey: 'achievedAt',
                cell: ({ row }) => (
                    <span className="block text-right text-muted-foreground tabular-nums">
                        {format(
                            new Date(row.original.achievedAt),
                            'MMM d, yyyy',
                        )}
                    </span>
                ),
                header: () => <span className="block text-right">Date</span>,
            },
        ],
        [unitWeight],
    );

    return (
        <div className="flex flex-col gap-6">
            {active.data && (
                <Link className="block" href={routes.lifting.log}>
                    <Alert variant="success">
                        <Activity className="size-4" />
                        <AlertTitle>Active workout</AlertTitle>
                        <AlertDescription>
                            {active.data.name ?? 'Workout'} — resume
                        </AlertDescription>
                    </Alert>
                </Link>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Stat
                    icon={<Flame className="size-4" />}
                    label="Current streak"
                    value={
                        summary.data ? `${summary.data.currentStreak} wk` : '—'
                    }
                />
                <Stat
                    icon={<Activity className="size-4" />}
                    label="Sessions this week"
                    value={
                        summary.data
                            ? summary.data.sessionsThisWeek.toFixed(0)
                            : '—'
                    }
                />
                <Stat
                    icon={<Trophy className="size-4" />}
                    label="Recent PRs"
                    value={
                        summary.data
                            ? summary.data.recentPrs.length.toString()
                            : '—'
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
                        <Button
                            className="gap-2"
                            disabled={start.isPending || !!active.data}
                            onClick={() => start.mutate({})}
                            type="button"
                        >
                            <Play className="size-4" />
                            {active.data
                                ? 'Resume active'
                                : start.isPending
                                  ? 'Starting…'
                                  : 'Start workout'}
                        </Button>
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

            {(summary.isLoading ||
                (summary.data && summary.data.recentPrs.length > 0)) && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                            <Trophy className="size-4" /> Recent PRs
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
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
                            headerActions={
                                <div className="flex flex-col gap-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <ClearFiltersButton
                                            active={isPrFiltersActive}
                                            className="hidden md:flex"
                                            onReset={resetPrFilters}
                                        />
                                        <Select
                                            onValueChange={setPrKindFilter}
                                            value={prKindFilter}
                                        >
                                            <SelectTrigger className="h-8 w-36 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value={PR_KIND_ALL}>
                                                    All kinds
                                                </SelectItem>
                                                {PR_KIND_VALUES.map((k) => (
                                                    <SelectItem
                                                        key={k}
                                                        value={k}
                                                    >
                                                        <span className="capitalize">
                                                            {k.replaceAll(
                                                                '_',
                                                                ' ',
                                                            )}
                                                        </span>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Select
                                            onValueChange={(v) =>
                                                handlePresetChange(v as PrRange)
                                            }
                                            value={
                                                prCustomRange ? 'all' : prRange
                                            }
                                        >
                                            <SelectTrigger className="h-8 w-36 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {PR_RANGE_VALUES.map((r) => (
                                                    <SelectItem
                                                        key={r}
                                                        value={r}
                                                    >
                                                        {PR_RANGE_LABEL[r]}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <DateRangePicker
                                            align="end"
                                            className="h-8 text-xs"
                                            onChange={handleCustomRangeChange}
                                            placeholder="Custom range"
                                            value={prCustomRange}
                                        />
                                    </div>
                                    <ClearFiltersButton
                                        active={isPrFiltersActive}
                                        className="md:hidden"
                                        onReset={resetPrFilters}
                                    />
                                </div>
                            }
                            isLoading={summary.isLoading}
                            pageSize={null}
                            rowId={(r) => r.id}
                            showFilter
                            skeletonRows={3}
                        />
                    </CardContent>
                </Card>
            )}
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
    value: string;
}) {
    return (
        <Card className="gap-2 py-4">
            <CardContent>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {icon}
                    {label}
                </div>
                <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
            </CardContent>
        </Card>
    );
}
