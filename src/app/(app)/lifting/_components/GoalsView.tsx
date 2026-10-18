'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
    differenceInCalendarDays,
    eachDayOfInterval,
    getDay,
    isBefore,
    parseISO,
    startOfDay,
    subDays,
} from 'date-fns';
import {
    CalendarRange,
    Check,
    Flag,
    Pause,
    Play,
    Plus,
    RotateCcw,
    Target,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useId, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { HEAT_LEVEL_CLASS } from '~/app/(app)/lifting/_components/shared/heatLevelClass';
import {
    deleteRowAction,
    type RowAction,
    RowActionKind,
    rowActionsColumn,
} from '~/components/RowActionsMenu';
import { StatStrip, StatTone } from '~/components/StatStrip';
import { ToolPanel } from '~/components/ToolPanel';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Calendar } from '~/components/ui/calendar';
import {
    DataTable,
    type DataTableColumn,
    DataTableFilterFunction,
} from '~/components/ui/data-table';
import { DataTableDateRange } from '~/components/ui/data-table-date-range';
import { DataTableFacetSelect } from '~/components/ui/data-table-facet-select';
import { DatePicker } from '~/components/ui/date-picker';
import { EmptyState } from '~/components/ui/empty-state';
import { Field, FieldError, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Progress } from '~/components/ui/progress';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/select';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '~/components/ui/tooltip';
import { formatDisplayDate } from '~/lib/format';
import { localIsoDate } from '~/lib/lifting/date-range';
import { WeightUnit } from '~/lib/lifting/format';
import { type CreateGoalInput, goalInputSchema } from '~/lib/lifting/schemas';
import {
    GOAL_KIND_VALUES,
    GOAL_STATUS,
    GOAL_STATUS_VALUES,
    type GoalKind,
    type GoalStatus,
    type UnitWeight,
} from '~/lib/lifting/types';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { api, type RouterOutputs } from '~/trpc/react';

type GoalRow = RouterOutputs['lifting']['goal']['list'][number];

const STATUS_FILTER = {
    ACHIEVED: 'achieved',
    ACTIVE: 'active',
    ALL: 'all',
    FAILED: 'failed',
    PAUSED: 'paused',
} as const;

const EXERCISE_NONE = '__none__';

const STATUS_LABEL: Record<GoalStatus, string> = {
    achieved: 'Achieved',
    active: 'Active',
    failed: 'Failed',
    paused: 'Paused',
};

const KIND_LABEL: Record<GoalKind, string> = {
    bodyweight: 'Bodyweight',
    onerepmax: '1RM',
    rep_pr: 'Rep PR',
    streak: 'Streak',
    volume: 'Volume',
    weekly_frequency: 'Weekly freq.',
};

const WEIGHT_KIND: ReadonlySet<GoalKind> = new Set([
    'bodyweight',
    'onerepmax',
    'volume',
]);

function formatGoalTarget(
    kind: GoalKind,
    value: number,
    unitWeight: UnitWeight,
): string {
    if (WEIGHT_KIND.has(kind)) return WeightUnit.format(value, unitWeight);
    if (kind === 'rep_pr') return `${value} reps`;
    if (kind === 'weekly_frequency') return `${value} /wk`;
    return kind === 'streak' ? `${value} wk` : String(value);
}

const WEEKDAY_HINTS = ['Mon', 'Wed', 'Fri'] as const;

const CALENDAR_MODIFIER_CLASS = {
    achieved: 'bg-success/30 text-success hover:bg-success/40 rounded-md',
    targetActive: 'bg-warning/30 text-warning hover:bg-warning/40 rounded-md',
    targetMissed:
        'bg-destructive/30 text-destructive hover:bg-destructive/40 rounded-md',
} as const;

interface CalendarMarkers {
    achieved: Date[];
    targetActive: Date[];
    targetMissed: Date[];
}

interface HeatmapCell {
    count: number;
    date: string;
    level: number;
}

interface HeatmapGrid {
    hasAny: boolean;
    weeks: (HeatmapCell | null)[][];
}

interface Stats {
    achieved: number;
    active: number;
    failed: number;
    paused: number;
    total: number;
}

export function GoalsView() {
    const formId = useId();
    const utilities = api.useUtils();
    const goalsQuery = api.lifting.goal.list.useQuery({});
    const settings = api.lifting.settings.get.useQuery();
    const unitWeight = settings.data?.unitWeight ?? 'kg';
    const goals = useMemo<GoalRow[]>(
        () => goalsQuery.data ?? [],
        [goalsQuery.data],
    );

    const invalidate = () => utilities.lifting.goal.list.invalidate();
    const create = api.lifting.goal.create.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: () => {
            toast.success('Goal created');
            void invalidate();
        },
    });
    const markAchieved = api.lifting.goal.markAchieved.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: () => {
            toast.success('Goal achieved, nice work.');
            void invalidate();
        },
    });
    const update = api.lifting.goal.update.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: () => void invalidate(),
    });
    const remove = api.lifting.goal.delete.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: () => {
            toast.success('Goal deleted');
            void invalidate();
        },
    });

    const newGoalForm = useForm<CreateGoalInput>({
        defaultValues: {
            kind: 'onerepmax',
            targetDate: null,
            targetValue: 0,
        },
        resolver: zodResolver(goalInputSchema),
    });
    const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());

    const stats = useMemo(() => computeStats(goals), [goals]);
    const heatmap = useMemo(() => buildHeatmap(goals), [goals]);
    const calendarMarkers = useMemo(() => buildCalendarMarkers(goals), [goals]);

    const exerciseNameById = useMemo(() => {
        const map = new Map<string, string>();
        for (const g of goals) {
            if (g.exerciseId && g.exerciseName) {
                map.set(g.exerciseId, g.exerciseName);
            }
        }
        return map;
    }, [goals]);

    const setStatus = useCallback(
        (g: GoalRow, status: GoalStatus) => {
            update.mutate({
                exerciseId: g.exerciseId,
                id: g.id,
                kind: g.kind,
                status,
                targetDate: g.targetDate,
                targetValue: g.targetValue,
            });
        },
        [update],
    );

    const submit = newGoalForm.handleSubmit((values) => {
        create.mutate(values, {
            onSuccess: () =>
                newGoalForm.reset({
                    kind: values.kind,
                    targetDate: null,
                    targetValue: 0,
                }),
        });
    });

    const columns = useMemo<DataTableColumn<GoalRow>[]>(
        () => [
            {
                accessorKey: 'kind',
                cell: ({ row }) => (
                    <Badge className="capitalize">
                        {KIND_LABEL[row.original.kind]}
                    </Badge>
                ),
                filterFn: DataTableFilterFunction.Equals,
                header: 'Kind',
                id: 'kind',
            },
            {
                accessorKey: 'targetValue',
                cell: ({ row }) => (
                    <span className="font-semibold text-foreground tabular-nums">
                        {formatGoalTarget(
                            row.original.kind,
                            row.original.targetValue,
                            unitWeight,
                        )}
                    </span>
                ),
                header: 'Target',
                meta: { isRowHeader: true },
            },
            {
                accessorFn: (row) => row.exerciseId ?? EXERCISE_NONE,
                cell: ({ row }) =>
                    row.original.exerciseSlug && row.original.exerciseName ? (
                        <Link
                            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                            href={routes.lifting.exercise(
                                row.original.exerciseSlug,
                            )}
                        >
                            {row.original.exerciseName}
                        </Link>
                    ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                    ),
                enableSorting: false,
                filterFn: DataTableFilterFunction.Equals,
                header: 'Exercise',
                id: 'exercise',
            },
            {
                accessorFn: (row) =>
                    row.targetDate ? parseISO(row.targetDate).getTime() : -1,
                cell: ({ row }) => (
                    <TargetDateCell
                        status={row.original.status}
                        targetDate={row.original.targetDate}
                    />
                ),
                filterFn: DataTableFilterFunction.InNumberRange,
                header: 'Target date',
                id: 'targetDate',
            },
            {
                accessorKey: 'status',
                cell: ({ row }) => (
                    <Badge>{STATUS_LABEL[row.original.status]}</Badge>
                ),
                filterFn: DataTableFilterFunction.Equals,
                header: 'Status',
                id: 'status',
            },
            {
                accessorFn: (row) => new Date(row.createdAt).getTime(),
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground tabular-nums">
                        {formatDisplayDate(row.original.createdAt)}
                    </span>
                ),
                header: 'Created',
                id: 'created',
            },
            {
                accessorFn: (row) =>
                    row.achievedAt ? new Date(row.achievedAt).getTime() : 0,
                cell: ({ row }) =>
                    row.original.achievedAt ? (
                        <span className="text-xs text-success tabular-nums">
                            {formatDisplayDate(row.original.achievedAt)}
                        </span>
                    ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                    ),
                header: 'Achieved',
                id: 'achieved',
            },
            rowActionsColumn<GoalRow>({
                actionsOf: (goal) => [
                    ...goalStatusActions(goal, {
                        onAchieve: () => markAchieved.mutate({ id: goal.id }),
                        onStatus: (status) => setStatus(goal, status),
                    }),
                    deleteRowAction({
                        description: 'This goal will be removed permanently.',
                        onDelete: () => remove.mutate({ id: goal.id }),
                        title: 'Delete goal?',
                    }),
                ],
                isPendingOf: () =>
                    markAchieved.isPending ||
                    update.isPending ||
                    remove.isPending,
                labelOf: (goal) =>
                    `${KIND_LABEL[goal.kind]} ${formatGoalTarget(goal.kind, goal.targetValue, unitWeight)}`,
            }),
        ],
        [markAchieved, update, remove, setStatus, unitWeight],
    );

    const achievementRate =
        stats.total > 0 ? Math.round((stats.achieved / stats.total) * 100) : 0;

    return (
        <div className="flex flex-col gap-6">
            <StatStrip
                isLoading={goalsQuery.isLoading}
                items={[
                    {
                        id: 'active',
                        label: 'Active',
                        value: stats.active,
                    },
                    {
                        caption:
                            stats.total > 0
                                ? `${achievementRate}% achievement rate`
                                : undefined,
                        id: 'achieved',
                        label: 'Achieved',
                        tone: StatTone.Positive,
                        value: stats.achieved,
                    },
                    {
                        id: 'failed',
                        label: 'Failed',
                        tone: StatTone.Negative,
                        value: stats.failed,
                    },
                    {
                        id: 'paused',
                        label: 'Paused',
                        tone: StatTone.Warning,
                        value: stats.paused,
                    },
                ]}
            />

            {stats.total > 0 && (
                <ToolPanel contentClassName="gap-3" title="Achievement rate">
                    <span className="text-xs text-muted-foreground tabular-nums">
                        {stats.achieved} / {stats.total} goals ·{' '}
                        <span className="text-success">{achievementRate}%</span>
                    </span>
                    <Progress className="h-2" value={achievementRate} />
                </ToolPanel>
            )}

            <ToolPanel title="New goal">
                <form
                    className="grid grid-cols-2 gap-3 lg:grid-cols-4"
                    onSubmit={submit}
                >
                    <Controller
                        control={newGoalForm.control}
                        name="kind"
                        render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                                <FieldLabel
                                    className="text-xs text-muted-foreground"
                                    htmlFor={`${formId}-kind`}
                                >
                                    Kind
                                </FieldLabel>
                                <Select
                                    onValueChange={field.onChange}
                                    value={field.value}
                                >
                                    <SelectTrigger
                                        aria-invalid={fieldState.invalid}
                                        id={`${formId}-kind`}
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {GOAL_KIND_VALUES.map((k) => (
                                            <SelectItem key={k} value={k}>
                                                {KIND_LABEL[k]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FieldError errors={[fieldState.error]} />
                            </Field>
                        )}
                    />
                    <Controller
                        control={newGoalForm.control}
                        name="targetValue"
                        render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                                <FieldLabel
                                    className="text-xs text-muted-foreground"
                                    htmlFor={`${formId}-targetValue`}
                                >
                                    Target value
                                </FieldLabel>
                                <Input
                                    aria-invalid={fieldState.invalid}
                                    id={`${formId}-targetValue`}
                                    inputMode="decimal"
                                    onChange={(event) => {
                                        const n = Number(event.target.value);
                                        field.onChange(
                                            Number.isFinite(n) ? n : 0,
                                        );
                                    }}
                                    ref={field.ref}
                                    step="any"
                                    type="number"
                                    value={field.value}
                                />
                                <FieldError errors={[fieldState.error]} />
                            </Field>
                        )}
                    />
                    <Controller
                        control={newGoalForm.control}
                        name="targetDate"
                        render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                                <FieldLabel
                                    className="text-xs text-muted-foreground"
                                    htmlFor={`${formId}-targetDate`}
                                >
                                    Target date
                                </FieldLabel>
                                <DatePicker
                                    className="w-full"
                                    id={`${formId}-targetDate`}
                                    minDate={startOfDay(new Date())}
                                    onChange={(d) =>
                                        field.onChange(
                                            d ? localIsoDate(d) : null,
                                        )
                                    }
                                    value={
                                        field.value
                                            ? parseISO(field.value)
                                            : undefined
                                    }
                                />
                                <FieldError errors={[fieldState.error]} />
                            </Field>
                        )}
                    />
                    <div className="flex items-end">
                        <Button
                            className="w-full gap-2"
                            disabled={create.isPending}
                            type="submit"
                        >
                            <Plus className="size-4" /> Create
                        </Button>
                    </div>
                    {create.error?.message && (
                        <p className="col-span-full mt-1 text-xs text-destructive">
                            {create.error.message}
                        </p>
                    )}
                </form>
            </ToolPanel>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                <ToolPanel
                    className="h-full"
                    contentClassName="flex flex-1 flex-col"
                    title="Achievement heatmap"
                >
                    <AchievementHeatmap heatmap={heatmap} />
                </ToolPanel>
                <ToolPanel
                    contentClassName="flex flex-col items-center gap-3"
                    title="Target calendar"
                >
                    <Calendar
                        mode="single"
                        modifiers={{
                            achieved: calendarMarkers.achieved,
                            targetActive: calendarMarkers.targetActive,
                            targetMissed: calendarMarkers.targetMissed,
                        }}
                        modifiersClassNames={CALENDAR_MODIFIER_CLASS}
                        month={calendarMonth}
                        onMonthChange={setCalendarMonth}
                        selected={undefined}
                    />
                    <CalendarLegend />
                </ToolPanel>
            </div>

            <ToolPanel title="All goals">
                <DataTable<GoalRow>
                    columns={columns}
                    data={goals}
                    emptyState={(table) => {
                        const status =
                            (table.getColumn('status')?.getFilterValue() as
                                GoalStatus | undefined) ?? STATUS_FILTER.ALL;
                        return (
                            <EmptyState
                                description={
                                    status === STATUS_FILTER.ALL
                                        ? 'Set a target so you have something to chase.'
                                        : `No ${STATUS_LABEL[status].toLowerCase()} goals.`
                                }
                                icon={Target}
                                title="Nothing here yet"
                            />
                        );
                    }}
                    headerActions={(table) => (
                        <>
                            <DataTableFacetSelect
                                column={table.getColumn('kind')}
                                format={(k) => KIND_LABEL[k as GoalKind]}
                                label="Kind"
                                placeholder="All kinds"
                            />
                            <DataTableFacetSelect
                                column={table.getColumn('exercise')}
                                format={(id) =>
                                    id === EXERCISE_NONE
                                        ? 'Unassigned'
                                        : (exerciseNameById.get(id) ?? id)
                                }
                                label="Exercise"
                                placeholder="All exercises"
                            />
                            <DataTableFacetSelect
                                column={table.getColumn('status')}
                                format={goalStatusLabel}
                                label="Status"
                                placeholder="All statuses"
                            />
                            <DataTableDateRange
                                column={table.getColumn('targetDate')}
                                label="Target date"
                                placeholder="Any target date"
                            />
                        </>
                    )}
                    isLoading={goalsQuery.isLoading}
                    pageSize={10}
                    rowClassName={(r) =>
                        r.status === GOAL_STATUS.ACHIEVED
                            ? 'bg-success/5'
                            : undefined
                    }
                    rowId={(r) => r.id}
                    showFilter
                />
            </ToolPanel>
        </div>
    );
}

function AchievementHeatmap({ heatmap }: { heatmap: HeatmapGrid }) {
    return heatmap.hasAny ? (
        <TooltipProvider delayDuration={100}>
            <div className="flex h-full flex-col gap-2">
                <div className="flex items-stretch gap-2">
                    <div className="flex flex-col justify-between py-0.5 type-micro text-muted-foreground">
                        {WEEKDAY_HINTS.map((d) => (
                            <span key={d}>{d}</span>
                        ))}
                    </div>
                    <div className="flex flex-1 gap-1">
                        {heatmap.weeks.map((week, wi) => (
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
                                                {formatDisplayDate(cell.date)} ·{' '}
                                                {cell.count} achieved
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
                <div className="flex items-center justify-end gap-1 type-micro text-muted-foreground">
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
            description="Mark goals as achieved to fill this heatmap."
            icon={CalendarRange}
            title="No achievements yet"
        />
    );
}

function buildCalendarMarkers(goals: GoalRow[]): CalendarMarkers {
    const today = startOfDay(new Date());
    const markers: CalendarMarkers = {
        achieved: [],
        targetActive: [],
        targetMissed: [],
    };
    for (const g of goals) {
        if (g.achievedAt) {
            markers.achieved.push(startOfDay(new Date(g.achievedAt)));
        }
        if (!g.targetDate || g.status !== GOAL_STATUS.ACTIVE) continue;
        const d = parseISO(g.targetDate);
        if (isBefore(d, today)) markers.targetMissed.push(d);
        else markers.targetActive.push(d);
    }
    return markers;
}

function buildHeatmap(goals: GoalRow[]): HeatmapGrid {
    const today = startOfDay(new Date());
    const start = subDays(today, 364);
    const days = eachDayOfInterval({ end: today, start });

    const byDate = new Map<string, number>();
    for (const g of goals) {
        if (!g.achievedAt) continue;
        const d = startOfDay(new Date(g.achievedAt));
        if (isBefore(d, start)) continue;
        const key = localIsoDate(d);
        byDate.set(key, (byDate.get(key) ?? 0) + 1);
    }

    const max = Math.max(0, ...byDate.values());
    const levelFor = (count: number): number => {
        if (count <= 0 || max <= 0) return 0;
        const pct = count / max;
        if (pct < 0.25) return 1;
        if (pct < 0.5) return 2;
        return pct < 0.75 ? 3 : 4;
    };

    const padDays = (getDay(start) + 6) % 7;
    const cells: (HeatmapCell | null)[] = [];
    for (let index = 0; index < padDays; index++) cells.push(null);
    for (const d of days) {
        const key = localIsoDate(d);
        const count = byDate.get(key) ?? 0;
        cells.push({ count, date: key, level: levelFor(count) });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks: (HeatmapCell | null)[][] = [];
    for (let index = 0; index < cells.length; index += 7) {
        weeks.push(cells.slice(index, index + 7));
    }
    return { hasAny: max > 0, weeks };
}

function CalendarLegend() {
    return (
        <div className="flex flex-wrap items-center justify-center gap-3 type-micro text-muted-foreground">
            <LegendDot className="bg-success/60" label="Achieved" />
            <LegendDot className="bg-warning/60" label="Target upcoming" />
            <LegendDot className="bg-destructive/60" label="Target overdue" />
        </div>
    );
}

function computeStats(goals: GoalRow[]): Stats {
    const counts: Record<GoalStatus, number> = {
        achieved: 0,
        active: 0,
        failed: 0,
        paused: 0,
    };
    for (const g of goals) counts[g.status]++;
    return { ...counts, total: goals.length };
}

function goalStatusActions(
    goal: GoalRow,
    {
        onAchieve,
        onStatus,
    }: {
        onAchieve: () => void;
        onStatus: (status: GoalStatus) => void;
    },
): RowAction[] {
    switch (goal.status) {
        case GOAL_STATUS.ACHIEVED:
        case GOAL_STATUS.FAILED: {
            return [
                {
                    icon: RotateCcw,
                    kind: RowActionKind.Select,
                    label: 'Reopen',
                    onSelect: () => onStatus(GOAL_STATUS.ACTIVE),
                },
            ];
        }
        case GOAL_STATUS.ACTIVE: {
            return [
                {
                    icon: Check,
                    kind: RowActionKind.Select,
                    label: 'Mark achieved',
                    onSelect: onAchieve,
                },
                {
                    icon: Pause,
                    kind: RowActionKind.Select,
                    label: 'Pause',
                    onSelect: () => onStatus(GOAL_STATUS.PAUSED),
                },
                {
                    icon: Flag,
                    kind: RowActionKind.Select,
                    label: 'Mark failed',
                    onSelect: () => onStatus(GOAL_STATUS.FAILED),
                },
            ];
        }
        case GOAL_STATUS.PAUSED: {
            return [
                {
                    icon: Play,
                    kind: RowActionKind.Select,
                    label: 'Resume',
                    onSelect: () => onStatus(GOAL_STATUS.ACTIVE),
                },
            ];
        }
    }
}

function goalStatusLabel(value: string): string {
    const status = GOAL_STATUS_VALUES.find((candidate) => candidate === value);
    return status === undefined ? value : STATUS_LABEL[status];
}

function LegendDot({ className, label }: { className: string; label: string }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <span className={cn('size-2.5 rounded-sm', className)} />
            {label}
        </span>
    );
}

function TargetDateCell({
    status,
    targetDate,
}: {
    status: GoalStatus;
    targetDate: null | string;
}) {
    if (!targetDate)
        return <span className="text-xs text-muted-foreground">-</span>;
    if (status !== GOAL_STATUS.ACTIVE) {
        return (
            <span className="text-xs text-muted-foreground tabular-nums">
                {formatDisplayDate(targetDate)}
            </span>
        );
    }
    const date = parseISO(targetDate);
    const today = startOfDay(new Date());
    const diff = differenceInCalendarDays(date, today);
    const tone =
        diff < 0
            ? 'text-destructive'
            : diff <= 7
              ? 'text-warning'
              : 'text-muted-foreground';
    const label =
        diff === 0
            ? 'today'
            : diff > 0
              ? `in ${diff}d`
              : `${Math.abs(diff)}d overdue`;
    return (
        <span className="flex flex-col text-xs tabular-nums">
            <span className="text-muted-foreground">
                {formatDisplayDate(targetDate)}
            </span>
            <span className={cn('type-micro', tone)}>{label}</span>
        </span>
    );
}
