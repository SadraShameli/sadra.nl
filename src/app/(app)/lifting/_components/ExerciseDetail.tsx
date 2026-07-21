'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { endOfDay, format, startOfDay, subDays, subMonths } from 'date-fns';
import { ExternalLink, TrendingUp, Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { type DateRange } from 'react-day-picker';

import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import AreaChartNew from '~/components/ui/Chart/AreaChartNew';
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
import { Skeleton } from '~/components/ui/Skeleton';
import { WeightUnit } from '~/lib/lifting/format';
import { PR_KIND_VALUES } from '~/lib/lifting/types';
import { api, type RouterOutputs } from '~/trpc/react';

type Exercise = RouterOutputs['lifting']['exercise']['get'];
interface ExerciseDetailProperties {
    exercise: Exercise;
}

type PrRow = RouterOutputs['lifting']['analytics']['prTimeline'][number];

const PR_KIND_ALL = '__all__';

const PR_RANGE_VALUES = ['all', '7', '30', '90', '365'] as const;
type PrRange = (typeof PR_RANGE_VALUES)[number];
const PR_RANGE_LABEL: Record<PrRange, string> = {
    '7': 'Last 7 days',
    '30': 'Last 30 days',
    '90': 'Last 90 days',
    '365': 'Last year',
    all: 'All time',
};

const E1RM_CHART_CONFIG = {
    e1rm: { color: '#a3a3a3', label: 'Est. 1RM' },
} as const;

const E1RM_RANGE_VALUES = ['30', '90', '365', 'all'] as const;
type E1rmRange = (typeof E1RM_RANGE_VALUES)[number];
const E1RM_RANGE_LABEL: Record<E1rmRange, string> = {
    '30': 'Last 30 days',
    '90': 'Last 90 days',
    '365': 'Last year',
    all: 'All time',
};

export function ExerciseDetail({ exercise }: ExerciseDetailProperties) {
    const prs = api.lifting.analytics.prTimeline.useQuery({ id: exercise.id });
    const settings = api.lifting.settings.get.useQuery();
    const unitWeight = settings.data?.unitWeight ?? 'kg';

    const [prKindFilter, setPrKindFilter] = useState<string>(PR_KIND_ALL);
    const [prRange, setPrRange] = useState<PrRange>('all');
    const [prCustomRange, setPrCustomRange] = useState<DateRange | undefined>();

    const filteredPrs = useMemo(() => {
        let rows = prs.data ?? [];
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
    }, [prs.data, prKindFilter, prRange, prCustomRange]);

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

    const columns = useMemo<ColumnDef<PrRow>[]>(
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
                        {format(new Date(row.original.achievedAt), 'MMM d')}
                    </span>
                ),
                header: () => <span className="block text-right">Date</span>,
            },
        ],
        [unitWeight],
    );

    return (
        <div className="flex flex-col gap-8">
            <header>
                <p className="text-xs tracking-wide text-muted-foreground uppercase">
                    {exercise.equipment} · {exercise.primaryMuscle}
                </p>
                <h1 className="mt-1 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                    {exercise.name}
                </h1>
                {exercise.instructions && (
                    <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                        {exercise.instructions}
                    </p>
                )}
            </header>

            {exercise.videoUrl && (
                <Button
                    asChild
                    className="w-fit gap-2"
                    type="button"
                    variant="outline"
                >
                    <a
                        href={exercise.videoUrl}
                        rel="noreferrer"
                        target="_blank"
                    >
                        <ExternalLink className="size-4" />
                        Watch demo
                    </a>
                </Button>
            )}

            <E1rmTrendChart exerciseId={exercise.id} unitWeight={unitWeight} />

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                        <Trophy className="size-4" /> Personal records
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <DataTable
                        columns={columns}
                        data={filteredPrs}
                        emptyState={
                            <EmptyState
                                description={
                                    isPrFiltersActive
                                        ? 'No PRs match these filters.'
                                        : 'Log some sets and your PRs will show up here.'
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
                                                <SelectItem key={k} value={k}>
                                                    <span className="capitalize">
                                                        {k.replaceAll('_', ' ')}
                                                    </span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Select
                                        onValueChange={(v) =>
                                            handlePresetChange(v as PrRange)
                                        }
                                        value={prCustomRange ? 'all' : prRange}
                                    >
                                        <SelectTrigger className="h-8 w-36 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {PR_RANGE_VALUES.map((r) => (
                                                <SelectItem key={r} value={r}>
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
                        isLoading={prs.isLoading}
                        pageSize={null}
                        rowId={(r) => r.id}
                        showFilter
                        skeletonRows={4}
                    />
                </CardContent>
            </Card>
        </div>
    );
}

function E1rmTrendChart({
    exerciseId,
    unitWeight,
}: {
    exerciseId: string;
    unitWeight: 'kg' | 'lb';
}) {
    const [range, setRange] = useState<E1rmRange>('90');

    const queryRange = useMemo(() => {
        if (range === 'all') return { exerciseId };
        const to = new Date();
        const from =
            range === '30'
                ? subDays(to, 30)
                : range === '365'
                  ? subMonths(to, 12)
                  : subDays(to, 90);
        return { exerciseId, from, to };
    }, [exerciseId, range]);

    const trend = api.lifting.analytics.e1rmTrend.useQuery(queryRange);

    const chartData = useMemo(
        () =>
            (trend.data ?? []).map((d) => ({
                date: format(new Date(d.date), 'MMM d'),
                e1rm:
                    Math.round(WeightUnit.toDisplay(d.e1rm, unitWeight) * 10) /
                    10,
            })),
        [trend.data, unitWeight],
    );

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                        <TrendingUp className="size-4" /> Estimated 1RM trend
                    </CardTitle>
                    <Select
                        onValueChange={(v) => setRange(v as E1rmRange)}
                        value={range}
                    >
                        <SelectTrigger className="h-7 w-32 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {E1RM_RANGE_VALUES.map((r) => (
                                <SelectItem key={r} value={r}>
                                    {E1RM_RANGE_LABEL[r]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </CardHeader>
            <CardContent>
                {trend.isLoading ? (
                    <Skeleton className="h-48 w-full rounded-md" />
                ) : chartData.length === 0 ? (
                    <EmptyState
                        description="Log some sets for this exercise to see the estimated 1RM chart."
                        icon={TrendingUp}
                        title="No data yet"
                    />
                ) : (
                    <div className="h-48">
                        <AreaChartNew
                            area={{ dataKey: 'e1rm' }}
                            config={E1RM_CHART_CONFIG}
                            data={chartData}
                            tooltip={{ labelKey: 'date', nameKey: 'e1rm' }}
                            xAxis={{ dataKey: 'date' }}
                            yAxis={{
                                tickFormatter: (v: number) =>
                                    `${v} ${unitWeight}`,
                            }}
                        />
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
