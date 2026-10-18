'use client';

import { subDays, subMonths } from 'date-fns';
import { TrendingUp, Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';

import { PrFiltersToolbar } from '~/app/(app)/lifting/_components/shared/PrFiltersToolbar';
import { prTableColumns } from '~/app/(app)/lifting/_components/shared/prTableColumns';
import { usePrFilters } from '~/app/(app)/lifting/_components/shared/usePrFilters';
import { FilterToolbar } from '~/components/FilterToolbar';
import { ToolPanel } from '~/components/ToolPanel';
import AreaChartNew from '~/components/ui/chart/area-chart-new';
import { DataTable } from '~/components/ui/data-table';
import { EmptyState, NoMatchesState } from '~/components/ui/empty-state';
import { Skeleton } from '~/components/ui/skeleton';
import { ToolbarSelect } from '~/components/ui/toolbar-select';
import { formatDisplayDate } from '~/lib/format';
import { WeightUnit } from '~/lib/lifting/format';
import { api } from '~/trpc/react';

interface ExerciseProgressProperties {
    exerciseId: string;
}

const E1RM_CHART_CONFIG = {
    e1rm: { color: 'var(--chart-1)', label: 'Est. 1RM' },
} as const;

const E1RM_RANGE_VALUES = ['30', '90', '365', 'all'] as const;
type E1rmRange = (typeof E1RM_RANGE_VALUES)[number];
const E1RM_RANGE_LABEL: Record<E1rmRange, string> = {
    '30': 'Last 30 days',
    '90': 'Last 90 days',
    '365': 'Last year',
    all: 'All time',
};

export function ExerciseProgress({ exerciseId }: ExerciseProgressProperties) {
    const prs = api.lifting.analytics.prTimeline.useQuery({ id: exerciseId });
    const settings = api.lifting.settings.get.useQuery();
    const unitWeight = settings.data?.unitWeight ?? 'kg';

    const prFilters = usePrFilters(prs.data);

    const columns = useMemo(() => prTableColumns(unitWeight), [unitWeight]);

    return (
        <div className="flex flex-col gap-8">
            <E1rmTrendChart exerciseId={exerciseId} unitWeight={unitWeight} />

            <ToolPanel title="Personal records">
                {prs.data?.length === 0 ? (
                    <EmptyState
                        description="Log some sets of this exercise and your PRs will show up here."
                        icon={Trophy}
                        title="No PRs yet"
                    />
                ) : (
                    <DataTable
                        columns={columns}
                        data={prFilters.filteredRows}
                        emptyState={<NoMatchesState icon={Trophy} noun="PRs" />}
                        filterPlaceholder="Search PRs"
                        hasExternalFilters={prFilters.isActive}
                        headerActions={<PrFiltersToolbar filters={prFilters} />}
                        isLoading={prs.isLoading}
                        onResetFilters={prFilters.reset}
                        pageSize={null}
                        rowId={(r) => r.id}
                        showFilter
                        skeletonRows={4}
                    />
                )}
            </ToolPanel>
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
                date: formatDisplayDate(d.date),
                e1rm:
                    Math.round(WeightUnit.toDisplay(d.e1rm, unitWeight) * 10) /
                    10,
            })),
        [trend.data, unitWeight],
    );

    return (
        <ToolPanel title="Estimated 1RM trend">
            <FilterToolbar label="Trend filters">
                <ToolbarSelect
                    label="Trend period"
                    onValueChange={(v) => {
                        const next = E1RM_RANGE_VALUES.find((r) => r === v);
                        if (next) setRange(next);
                    }}
                    options={E1RM_RANGE_VALUES.map((r) => ({
                        label: E1RM_RANGE_LABEL[r],
                        value: r,
                    }))}
                    value={range}
                />
            </FilterToolbar>
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
                            tickFormatter: (v: number) => `${v} ${unitWeight}`,
                        }}
                    />
                </div>
            )}
        </ToolPanel>
    );
}
