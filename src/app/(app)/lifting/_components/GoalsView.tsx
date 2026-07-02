'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type ColumnDef } from '@tanstack/react-table';
import {
    differenceInCalendarDays,
    eachDayOfInterval,
    endOfDay,
    format,
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
    type LucideIcon,
    Pause,
    Play,
    Plus,
    RotateCcw,
    Target,
    Trash2,
    Trophy,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { type DateRange } from 'react-day-picker';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '~/components/ui/AlertDialog';
import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { Calendar } from '~/components/ui/Calendar';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import { ClearFiltersButton } from '~/components/ui/ClearFiltersButton';
import { DataTable } from '~/components/ui/DataTable';
import { DatePicker, DateRangePicker } from '~/components/ui/DatePicker';
import { EmptyState } from '~/components/ui/EmptyState';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '~/components/ui/Form';
import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import { Progress } from '~/components/ui/Progress';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/Tabs';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '~/components/ui/Tooltip';
import { WeightUnit } from '~/lib/lifting/format';
import {
    type CreateGoalInput,
    createGoalInputSchema,
} from '~/lib/lifting/schemas';
import {
    GOAL_KIND_VALUES,
    GOAL_STATUS,
    GOAL_STATUS_VALUES,
    type GoalKind,
    type GoalStatus,
    type UnitWeight,
} from '~/lib/lifting/types';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utils';
import { api, type RouterOutputs } from '~/trpc/react';

type GoalRow = RouterOutputs['lifting']['goal']['list'][number];

const STATUS_FILTER = {
    ACHIEVED: 'achieved',
    ACTIVE: 'active',
    ALL: 'all',
    FAILED: 'failed',
    PAUSED: 'paused',
} as const;

const FILTER_ALL = '__all__';
const EXERCISE_NONE = '__none__';

const STATUS_FILTER_VALUES = [
    STATUS_FILTER.ALL,
    ...GOAL_STATUS_VALUES,
] as const;

type StatusBadgeVariant =
    'default' | 'destructive' | 'secondary' | 'success' | 'warning';

type StatusFilter = (typeof STATUS_FILTER_VALUES)[number];

const STATUS_LABEL: Record<GoalStatus, string> = {
    achieved: 'Achieved',
    active: 'Active',
    failed: 'Failed',
    paused: 'Paused',
};

const STATUS_BADGE: Record<GoalStatus, StatusBadgeVariant> = {
    achieved: 'success',
    active: 'default',
    failed: 'destructive',
    paused: 'warning',
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
    if (kind === 'streak') return `${value} wk`;
    return String(value);
}

const HEAT_LEVELS = [
    'bg-muted/40',
    'bg-emerald-500/25',
    'bg-emerald-500/50',
    'bg-emerald-500/75',
    'bg-emerald-500',
] as const;

const WEEKDAY_HINTS = ['Mon', 'Wed', 'Fri'] as const;

const CALENDAR_MODIFIER_CLASS = {
    achieved:
        'bg-emerald-500/30 text-emerald-100 hover:bg-emerald-500/40 rounded-md',
    targetActive:
        'bg-amber-500/30 text-amber-100 hover:bg-amber-500/40 rounded-md',
    targetMissed:
        'bg-rose-500/30 text-rose-100 hover:bg-rose-500/40 rounded-md',
} as const;

interface Stats {
    achieved: number;
    active: number;
    failed: number;
    paused: number;
    total: number;
}

export function GoalsView() {
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
            toast.success('Goal achieved — nice work.');
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
        resolver: zodResolver(createGoalInputSchema),
    });
    const [statusFilter, setStatusFilter] = useState<StatusFilter>(
        STATUS_FILTER.ACTIVE,
    );
    const [kindFilter, setKindFilter] = useState<GoalKind | typeof FILTER_ALL>(
        FILTER_ALL,
    );
    const [exerciseFilter, setExerciseFilter] = useState<string>(FILTER_ALL);
    const [targetDateRange, setTargetDateRange] = useState<
        DateRange | undefined
    >();
    const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());

    const stats = useMemo(() => computeStats(goals), [goals]);
    const heatmap = useMemo(() => buildHeatmap(goals), [goals]);
    const calendarMarkers = useMemo(() => buildCalendarMarkers(goals), [goals]);

    const exerciseOptions = useMemo(() => {
        const seen = new Map<string, string>();
        for (const g of goals) {
            if (g.exerciseId && g.exerciseName && !seen.has(g.exerciseId)) {
                seen.set(g.exerciseId, g.exerciseName);
            }
        }
        return [...seen].map(([id, name]) => ({ id, name }));
    }, [goals]);

    const targetFrom = targetDateRange?.from
        ? startOfDay(targetDateRange.from)
        : undefined;
    const targetTo = targetDateRange?.to
        ? endOfDay(targetDateRange.to)
        : undefined;

    const filtered = useMemo(() => {
        return goals.filter((g) => {
            if (statusFilter !== STATUS_FILTER.ALL && g.status !== statusFilter)
                return false;
            if (kindFilter !== FILTER_ALL && g.kind !== kindFilter)
                return false;
            if (exerciseFilter !== FILTER_ALL) {
                if (exerciseFilter === EXERCISE_NONE) {
                    if (g.exerciseId) return false;
                } else if (g.exerciseId !== exerciseFilter) {
                    return false;
                }
            }
            if (targetFrom || targetTo) {
                if (!g.targetDate) return false;
                const t = parseISO(g.targetDate);
                if (targetFrom && t < targetFrom) return false;
                if (targetTo && t > targetTo) return false;
            }
            return true;
        });
    }, [goals, statusFilter, kindFilter, exerciseFilter, targetFrom, targetTo]);

    const clearExtraFilters = () => {
        setKindFilter(FILTER_ALL);
        setExerciseFilter(FILTER_ALL);
        setTargetDateRange(undefined);
    };
    const hasExtraFilters =
        kindFilter !== FILTER_ALL ||
        exerciseFilter !== FILTER_ALL ||
        Boolean(targetDateRange);

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

    const columns = useMemo<ColumnDef<GoalRow>[]>(
        () => [
            {
                accessorKey: 'kind',
                cell: ({ row }) => (
                    <Badge className="capitalize" variant="outline">
                        {KIND_LABEL[row.original.kind]}
                    </Badge>
                ),
                header: 'Kind',
                id: 'kind',
            },
            {
                accessorKey: 'targetValue',
                cell: ({ row }) => (
                    <span className="font-semibold text-white tabular-nums">
                        {formatGoalTarget(
                            row.original.kind,
                            row.original.targetValue,
                            unitWeight,
                        )}
                    </span>
                ),
                header: 'Target',
            },
            {
                cell: ({ row }) =>
                    row.original.exerciseSlug && row.original.exerciseName ? (
                        <Link
                            className="text-xs text-muted-foreground hover:text-white hover:underline"
                            href={routes.lifting.exercise(
                                row.original.exerciseSlug,
                            )}
                        >
                            {row.original.exerciseName}
                        </Link>
                    ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                    ),
                enableSorting: false,
                header: 'Exercise',
                id: 'exercise',
            },
            {
                accessorFn: (row) => row.targetDate ?? '',
                cell: ({ row }) => (
                    <TargetDateCell
                        status={row.original.status}
                        targetDate={row.original.targetDate}
                    />
                ),
                header: 'Target date',
                id: 'targetDate',
            },
            {
                accessorKey: 'status',
                cell: ({ row }) => (
                    <Badge variant={STATUS_BADGE[row.original.status]}>
                        {STATUS_LABEL[row.original.status]}
                    </Badge>
                ),
                header: 'Status',
                id: 'status',
            },
            {
                accessorFn: (row) => new Date(row.createdAt).getTime(),
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground tabular-nums">
                        {format(
                            new Date(row.original.createdAt),
                            'MMM d, yyyy',
                        )}
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
                        <span className="text-xs text-emerald-400 tabular-nums">
                            {format(
                                new Date(row.original.achievedAt),
                                'MMM d, yyyy',
                            )}
                        </span>
                    ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                    ),
                header: 'Achieved',
                id: 'achieved',
            },
            {
                cell: ({ row }) => (
                    <GoalActions
                        busy={
                            markAchieved.isPending ||
                            update.isPending ||
                            remove.isPending
                        }
                        goal={row.original}
                        onAchieve={(id) => markAchieved.mutate({ id })}
                        onDelete={(id) => remove.mutate({ id })}
                        onStatus={setStatus}
                    />
                ),
                enableSorting: false,
                header: () => <span className="block text-right">Actions</span>,
                id: 'actions',
            },
        ],
        [markAchieved, update, remove, setStatus, unitWeight],
    );

    const achievementRate =
        stats.total > 0 ? Math.round((stats.achieved / stats.total) * 100) : 0;

    return (
        <div className="flex flex-col gap-6">
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard
                    icon={Target}
                    label="Active"
                    tone="default"
                    value={stats.active}
                />
                <StatCard
                    icon={Trophy}
                    label="Achieved"
                    sub={
                        stats.total > 0
                            ? `${achievementRate}% achievement rate`
                            : undefined
                    }
                    tone="success"
                    value={stats.achieved}
                />
                <StatCard
                    icon={Flag}
                    label="Failed"
                    tone="destructive"
                    value={stats.failed}
                />
                <StatCard
                    icon={Pause}
                    label="Paused"
                    tone="warning"
                    value={stats.paused}
                />
            </section>

            {stats.total > 0 && (
                <Card>
                    <CardContent>
                        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                            <span className="font-medium tracking-wide uppercase">
                                Achievement rate
                            </span>
                            <span className="tabular-nums">
                                {stats.achieved} / {stats.total} goals ·{' '}
                                <span className="text-emerald-400">
                                    {achievementRate}%
                                </span>
                            </span>
                        </div>
                        <Progress
                            className="mt-3 h-2"
                            value={achievementRate}
                        />
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                        New goal
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <Form {...newGoalForm}>
                        <form
                            className="grid grid-cols-2 gap-3 lg:grid-cols-4"
                            onSubmit={submit}
                        >
                            <FormField
                                control={newGoalForm.control}
                                name="kind"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-xs text-muted-foreground">
                                            Kind
                                        </FormLabel>
                                        <Select
                                            onValueChange={field.onChange}
                                            value={field.value}
                                        >
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {GOAL_KIND_VALUES.map((k) => (
                                                    <SelectItem
                                                        key={k}
                                                        value={k}
                                                    >
                                                        {KIND_LABEL[k]}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={newGoalForm.control}
                                name="targetValue"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-xs text-muted-foreground">
                                            Target value
                                        </FormLabel>
                                        <FormControl>
                                            <Input
                                                inputMode="decimal"
                                                onChange={(e) => {
                                                    const n = Number.parseFloat(
                                                        e.target.value,
                                                    );
                                                    field.onChange(
                                                        Number.isFinite(n)
                                                            ? n
                                                            : 0,
                                                    );
                                                }}
                                                ref={field.ref}
                                                step="any"
                                                type="number"
                                                value={field.value}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={newGoalForm.control}
                                name="targetDate"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-xs text-muted-foreground">
                                            Target date
                                        </FormLabel>
                                        <DatePicker
                                            className="w-full"
                                            minDate={startOfDay(new Date())}
                                            onChange={(d) =>
                                                field.onChange(
                                                    d
                                                        ? format(
                                                              d,
                                                              'yyyy-MM-dd',
                                                          )
                                                        : null,
                                                )
                                            }
                                            value={
                                                field.value
                                                    ? parseISO(field.value)
                                                    : undefined
                                            }
                                        />
                                        <FormMessage />
                                    </FormItem>
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
                    </Form>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                <Card className="h-full">
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                            Achievement heatmap
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col">
                        <AchievementHeatmap heatmap={heatmap} />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                            <span>Target calendar</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center gap-3">
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
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                        <span>All goals</span>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <Tabs
                        onValueChange={(v) =>
                            setStatusFilter(v as StatusFilter)
                        }
                        value={statusFilter}
                    >
                        <TabsList className="mb-3 flex h-auto w-fit flex-wrap self-start">
                            {STATUS_FILTER_VALUES.map((s) => (
                                <TabsTrigger key={s} value={s}>
                                    <span className="capitalize">
                                        {s === STATUS_FILTER.ALL
                                            ? 'All'
                                            : STATUS_LABEL[s]}
                                    </span>
                                    <span className="ml-1.5 text-[10px] text-muted-foreground tabular-nums">
                                        {tabCount(goals, s)}
                                    </span>
                                </TabsTrigger>
                            ))}
                        </TabsList>

                        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_2fr]">
                            <div className="flex flex-col gap-1.5">
                                <Label className="text-xs">Kind</Label>
                                <Select
                                    onValueChange={(v) =>
                                        setKindFilter(
                                            v as GoalKind | typeof FILTER_ALL,
                                        )
                                    }
                                    value={kindFilter}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={FILTER_ALL}>
                                            All kinds
                                        </SelectItem>
                                        {GOAL_KIND_VALUES.map((k) => (
                                            <SelectItem key={k} value={k}>
                                                {KIND_LABEL[k]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label className="text-xs">Exercise</Label>
                                <Select
                                    onValueChange={setExerciseFilter}
                                    value={exerciseFilter}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={FILTER_ALL}>
                                            All exercises
                                        </SelectItem>
                                        <SelectItem value={EXERCISE_NONE}>
                                            Unassigned
                                        </SelectItem>
                                        {exerciseOptions.map((e) => (
                                            <SelectItem key={e.id} value={e.id}>
                                                {e.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label className="text-xs">Target date</Label>
                                <DateRangePicker
                                    onChange={setTargetDateRange}
                                    placeholder="Any target date"
                                    value={targetDateRange}
                                />
                            </div>
                        </div>
                        {STATUS_FILTER_VALUES.map((s) => (
                            <TabsContent key={s} value={s}>
                                <DataTable<GoalRow, unknown>
                                    columns={columns}
                                    data={filtered}
                                    emptyState={
                                        <EmptyState
                                            description={
                                                s === STATUS_FILTER.ALL
                                                    ? 'Set a target so you have something to chase.'
                                                    : `No ${STATUS_LABEL[s].toLowerCase()} goals.`
                                            }
                                            icon={Target}
                                            title="Nothing here yet"
                                        />
                                    }
                                    headerActions={
                                        <ClearFiltersButton
                                            active={hasExtraFilters}
                                            onReset={clearExtraFilters}
                                        />
                                    }
                                    isLoading={goalsQuery.isLoading}
                                    pageSize={10}
                                    rowClassName={(r) =>
                                        r.status === GOAL_STATUS.ACHIEVED
                                            ? 'bg-emerald-500/5'
                                            : undefined
                                    }
                                    rowId={(r) => r.id}
                                    showFilter
                                />
                            </TabsContent>
                        ))}
                    </Tabs>
                </CardContent>
            </Card>
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

function tabCount(goals: GoalRow[], status: StatusFilter): number {
    if (status === STATUS_FILTER.ALL) return goals.length;
    return goals.filter((g) => g.status === status).length;
}

const STAT_TONE: Record<
    'default' | 'destructive' | 'success' | 'warning',
    string
> = {
    default: 'text-primary',
    destructive: 'text-destructive',
    success: 'text-emerald-400',
    warning: 'text-amber-400',
};

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

function AchievementHeatmap({ heatmap }: { heatmap: HeatmapGrid }) {
    if (!heatmap.hasAny) {
        return (
            <EmptyState
                description="Mark goals as achieved to fill this heatmap."
                icon={CalendarRange}
                title="No achievements yet"
            />
        );
    }

    return (
        <TooltipProvider delayDuration={100}>
            <div className="flex h-full flex-col gap-2">
                <div className="flex items-stretch gap-2">
                    <div className="flex flex-col justify-between py-0.5 text-[10px] text-muted-foreground">
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
                                                        HEAT_LEVELS[cell.level],
                                                    )}
                                                />
                                            </TooltipTrigger>
                                            <TooltipContent
                                                className="text-xs"
                                                side="top"
                                            >
                                                {cell.date} · {cell.count}{' '}
                                                achieved
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
                    {HEAT_LEVELS.map((c, index) => (
                        <span
                            className={cn('size-3 rounded-sm', c)}
                            key={index}
                        />
                    ))}
                    <span>More</span>
                </div>
            </div>
        </TooltipProvider>
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
        if (g.targetDate && g.status === GOAL_STATUS.ACTIVE) {
            const d = parseISO(g.targetDate);
            if (isBefore(d, today)) markers.targetMissed.push(d);
            else markers.targetActive.push(d);
        }
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
        const key = format(d, 'yyyy-MM-dd');
        byDate.set(key, (byDate.get(key) ?? 0) + 1);
    }

    const max = Math.max(0, ...byDate.values());
    const levelFor = (count: number): number => {
        if (count <= 0 || max <= 0) return 0;
        const pct = count / max;
        if (pct < 0.25) return 1;
        if (pct < 0.5) return 2;
        if (pct < 0.75) return 3;
        return 4;
    };

    const padDays = (getDay(start) + 6) % 7;
    const cells: (HeatmapCell | null)[] = [];
    for (let index = 0; index < padDays; index++) cells.push(null);
    for (const d of days) {
        const key = format(d, 'yyyy-MM-dd');
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
        <div className="flex flex-wrap items-center justify-center gap-3 text-[10px] text-muted-foreground">
            <LegendDot className="bg-emerald-500/60" label="Achieved" />
            <LegendDot className="bg-amber-500/60" label="Target upcoming" />
            <LegendDot className="bg-rose-500/60" label="Target overdue" />
        </div>
    );
}

function GoalActions({
    busy,
    goal,
    onAchieve,
    onDelete,
    onStatus,
}: {
    busy: boolean;
    goal: GoalRow;
    onAchieve: (id: string) => void;
    onDelete: (id: string) => void;
    onStatus: (goal: GoalRow, status: GoalStatus) => void;
}) {
    return (
        <TooltipProvider delayDuration={100}>
            <div className="flex items-center justify-end gap-1">
                {goal.status === GOAL_STATUS.ACTIVE && (
                    <>
                        <IconAction
                            disabled={busy}
                            icon={Check}
                            iconClass="text-emerald-400"
                            label="Mark achieved"
                            onClick={() => onAchieve(goal.id)}
                        />
                        <IconAction
                            disabled={busy}
                            icon={Pause}
                            iconClass="text-amber-400"
                            label="Pause"
                            onClick={() => onStatus(goal, GOAL_STATUS.PAUSED)}
                        />
                        <IconAction
                            disabled={busy}
                            icon={Flag}
                            iconClass="text-rose-400"
                            label="Mark failed"
                            onClick={() => onStatus(goal, GOAL_STATUS.FAILED)}
                        />
                    </>
                )}
                {goal.status === GOAL_STATUS.PAUSED && (
                    <IconAction
                        disabled={busy}
                        icon={Play}
                        iconClass="text-emerald-400"
                        label="Resume"
                        onClick={() => onStatus(goal, GOAL_STATUS.ACTIVE)}
                    />
                )}
                {(goal.status === GOAL_STATUS.ACHIEVED ||
                    goal.status === GOAL_STATUS.FAILED) && (
                    <IconAction
                        disabled={busy}
                        icon={RotateCcw}
                        iconClass="text-muted-foreground"
                        label="Reopen"
                        onClick={() => onStatus(goal, GOAL_STATUS.ACTIVE)}
                    />
                )}
                <AlertDialog>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <AlertDialogTrigger asChild>
                                <Button
                                    aria-label="Delete goal"
                                    className="size-8 p-0"
                                    disabled={busy}
                                    type="button"
                                    variant="ghost"
                                >
                                    <Trash2 className="size-4 text-destructive" />
                                </Button>
                            </AlertDialogTrigger>
                        </TooltipTrigger>
                        <TooltipContent>Delete</TooltipContent>
                    </Tooltip>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete goal?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This goal will be removed permanently.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={() => onDelete(goal.id)}
                            >
                                Delete
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </TooltipProvider>
    );
}

function IconAction({
    disabled,
    icon: Icon,
    iconClass,
    label,
    onClick,
}: {
    disabled: boolean;
    icon: LucideIcon;
    iconClass: string;
    label: string;
    onClick: () => void;
}) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    aria-label={label}
                    className="size-8 p-0"
                    disabled={disabled}
                    onClick={onClick}
                    type="button"
                    variant="ghost"
                >
                    <Icon className={cn('size-4', iconClass)} />
                </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    );
}

function LegendDot({ className, label }: { className: string; label: string }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <span className={cn('size-2.5 rounded-sm', className)} />
            {label}
        </span>
    );
}

function StatCard({
    icon: Icon,
    label,
    sub,
    tone,
    value,
}: {
    icon: LucideIcon;
    label: string;
    sub?: string;
    tone: keyof typeof STAT_TONE;
    value: number;
}) {
    return (
        <Card className="gap-1 py-4">
            <CardContent>
                <div className="flex items-center gap-2">
                    <Icon className={cn('size-4', STAT_TONE[tone])} />
                    <span className="text-xs text-muted-foreground">
                        {label}
                    </span>
                </div>
                <p className="mt-2 text-2xl font-bold text-white tabular-nums">
                    {value}
                </p>
                {sub && (
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {sub}
                    </p>
                )}
            </CardContent>
        </Card>
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
        return <span className="text-xs text-muted-foreground">—</span>;
    const date = parseISO(targetDate);
    const today = startOfDay(new Date());
    const diff = differenceInCalendarDays(date, today);
    if (status !== GOAL_STATUS.ACTIVE) {
        return (
            <span className="text-xs text-muted-foreground tabular-nums">
                {targetDate}
            </span>
        );
    }
    const tone =
        diff < 0
            ? 'text-rose-400'
            : diff <= 7
              ? 'text-amber-400'
              : 'text-muted-foreground';
    const label =
        diff === 0
            ? 'today'
            : diff > 0
              ? `in ${diff}d`
              : `${Math.abs(diff)}d overdue`;
    return (
        <span className="flex flex-col text-xs tabular-nums">
            <span className="text-muted-foreground">{targetDate}</span>
            <span className={cn('text-[10px]', tone)}>{label}</span>
        </span>
    );
}
