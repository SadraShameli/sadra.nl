'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { endOfDay, format, startOfDay } from 'date-fns';
import { Calendar, ExternalLink, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { type DateRange } from 'react-day-picker';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

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
import { Button } from '~/components/ui/Button';
import { ClearFiltersButton } from '~/components/ui/ClearFiltersButton';
import {
    DataTable,
    type DataTableColumn,
    DataTableFilterFunction,
    hasActiveColumnFilter,
} from '~/components/ui/DataTable';
import { DateRangePicker } from '~/components/ui/DatePicker';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '~/components/ui/Dialog';
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
import { Textarea } from '~/components/ui/Textarea';
import { DurationFormat } from '~/lib/lifting/format';
import { routes } from '~/lib/site/routes';
import { api, type RouterOutputs } from '~/trpc/react';

type WorkoutRow = RouterOutputs['lifting']['workout']['list'][number];

const FILTER_ALL = '__all__';

const STATUS_OPTIONS = [
    { label: 'All', value: FILTER_ALL },
    { label: 'Completed', value: 'completed' },
    { label: 'In progress', value: 'in-progress' },
] as const;

const DURATION_OPTIONS = [
    { label: 'Any', value: FILTER_ALL },
    { label: '< 15 min', value: 'under-15' },
    { label: '15 – 60 min', value: '15-60' },
    { label: '1 – 2 h', value: '60-120' },
    { label: '> 2 h', value: 'over-120' },
] as const;

type DurationFilter = (typeof DURATION_OPTIONS)[number]['value'];
type StatusFilter = (typeof STATUS_OPTIONS)[number]['value'];

const DURATION_RANGES: Record<
    Exclude<DurationFilter, typeof FILTER_ALL>,
    [number, number]
> = {
    '15-60': [15 * 60, 60 * 60 - 1],
    '60-120': [60 * 60, 120 * 60 - 1],
    'over-120': [120 * 60, Infinity],
    'under-15': [0, 15 * 60 - 1],
};

const DURATION_RANGE_ENTRIES = Object.entries(DURATION_RANGES) as [
    Exclude<DurationFilter, typeof FILTER_ALL>,
    [number, number],
][];

function durationBucketOf(filterValue: unknown): DurationFilter {
    if (!Array.isArray(filterValue)) return FILTER_ALL;
    const [min, max] = filterValue as [number, number];
    const match = DURATION_RANGE_ENTRIES.find(
        ([, range]) => range[0] === min && range[1] === max,
    );
    return match ? match[0] : FILTER_ALL;
}

const workoutEditSchema = z.object({
    bodyweightKg: z.number().positive().max(500).nullable(),
    name: z.string().trim().max(128).nullable(),
    notes: z.string().max(4000).nullable(),
});

type WorkoutEditValues = z.infer<typeof workoutEditSchema>;

export function WorkoutsManager() {
    const utilities = api.useUtils();
    const workouts = api.lifting.workout.list.useQuery({
        from: new Date(0),
        limit: 200,
        offset: 0,
    });

    const update = api.lifting.workout.update.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Workout updated');
            await utilities.lifting.workout.list.invalidate();
        },
    });
    const remove = api.lifting.workout.delete.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Workout deleted');
            await utilities.lifting.workout.list.invalidate();
        },
    });

    const [editing, setEditing] = useState<null | WorkoutRow>(null);
    const [dateRange, setDateRange] = useState<DateRange | undefined>();

    const rows = useMemo(() => workouts.data ?? [], [workouts.data]);

    const columns = useMemo<DataTableColumn<WorkoutRow>[]>(
        () => [
            {
                accessorKey: 'name',
                cell: ({ row }) => (
                    <Link
                        className="font-medium text-white hover:underline"
                        href={routes.lifting.workout(row.original.id)}
                    >
                        {row.original.name ?? 'Workout'}
                    </Link>
                ),
                header: 'Workout',
            },
            {
                accessorFn: (r) => new Date(r.startedAt).getTime(),
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground tabular-nums">
                        {format(new Date(row.original.startedAt), 'EEE MMM d')}
                    </span>
                ),
                filterFn: DataTableFilterFunction.InNumberRange,
                header: 'Date',
                id: 'date',
            },
            {
                accessorFn: (r) => durationSeconds(r) ?? -1,
                cell: ({ row }) => {
                    const dur = durationSeconds(row.original);
                    return (
                        <span className="text-xs text-muted-foreground tabular-nums">
                            {dur === null ? '—' : DurationFormat.seconds(dur)}
                        </span>
                    );
                },
                filterFn: DataTableFilterFunction.InNumberRange,
                header: 'Duration',
                id: 'duration',
            },
            {
                accessorFn: (r) => (r.endedAt ? 'completed' : 'in-progress'),
                filterFn: DataTableFilterFunction.Equals,
                header: 'Status',
                id: 'status',
            },
            {
                cell: ({ row }) => (
                    <div className="flex items-center justify-end gap-2">
                        <Button
                            aria-label="Open workout"
                            asChild
                            size="sm"
                            variant="outline"
                        >
                            <Link
                                href={routes.lifting.workout(row.original.id)}
                            >
                                <ExternalLink className="size-3.5" />
                            </Link>
                        </Button>
                        <Button
                            aria-label="Edit workout"
                            onClick={() => setEditing(row.original)}
                            size="sm"
                            variant="outline"
                        >
                            <Pencil className="size-3.5" />
                        </Button>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button
                                    aria-label="Delete workout"
                                    size="sm"
                                    variant="outline"
                                >
                                    <Trash2 className="size-3.5" />
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>
                                        Delete &ldquo;
                                        {row.original.name ?? 'Workout'}
                                        &rdquo;?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Removes the workout and all its sets
                                        permanently.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>
                                        Cancel
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={() =>
                                            remove.mutate({
                                                id: row.original.id,
                                            })
                                        }
                                    >
                                        Delete
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                ),
                enableSorting: false,
                header: () => <span className="sr-only">Actions</span>,
                id: 'actions',
            },
        ],
        [remove],
    );

    return (
        <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
                Every workout you&apos;ve logged. Edit the metadata here or jump
                in to manage individual sets.
            </p>

            <DataTable
                belowFilter={(table) => (
                    <ClearFiltersButton
                        active={hasActiveColumnFilter(table)}
                        onReset={() => {
                            setDateRange(undefined);
                            table.resetColumnFilters();
                        }}
                    />
                )}
                columns={columns}
                data={rows}
                emptyState={(table) => (
                    <EmptyState
                        description={
                            hasActiveColumnFilter(table)
                                ? 'No workouts match these filters.'
                                : 'Start a workout from the log.'
                        }
                        icon={Calendar}
                        title={
                            hasActiveColumnFilter(table)
                                ? 'No matches'
                                : 'No workouts yet'
                        }
                    />
                )}
                filterPlaceholder="Search workouts…"
                filterPosition="bottom"
                headerActions={(table) => {
                    const statusColumn = table.getColumn('status');
                    const durationColumn = table.getColumn('duration');
                    const dateColumn = table.getColumn('date');
                    return (
                        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:flex-wrap md:items-end">
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
                                    Status
                                </span>
                                <Select
                                    onValueChange={(v) =>
                                        statusColumn?.setFilterValue(
                                            v === FILTER_ALL ? undefined : v,
                                        )
                                    }
                                    value={
                                        (statusColumn?.getFilterValue() as
                                            StatusFilter | undefined) ??
                                        FILTER_ALL
                                    }
                                >
                                    <SelectTrigger className="h-8 w-36 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {STATUS_OPTIONS.map((o) => (
                                            <SelectItem
                                                key={o.value}
                                                value={o.value}
                                            >
                                                {o.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
                                    Duration
                                </span>
                                <Select
                                    onValueChange={(v) =>
                                        durationColumn?.setFilterValue(
                                            v === FILTER_ALL
                                                ? undefined
                                                : DURATION_RANGES[
                                                      v as Exclude<
                                                          DurationFilter,
                                                          typeof FILTER_ALL
                                                      >
                                                  ],
                                        )
                                    }
                                    value={durationBucketOf(
                                        durationColumn?.getFilterValue(),
                                    )}
                                >
                                    <SelectTrigger className="h-8 w-36 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {DURATION_OPTIONS.map((o) => (
                                            <SelectItem
                                                key={o.value}
                                                value={o.value}
                                            >
                                                {o.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
                                    Date range
                                </span>
                                <DateRangePicker
                                    align="end"
                                    className="h-8 text-xs"
                                    maxDate={new Date()}
                                    onChange={(range) => {
                                        setDateRange(range);
                                        dateColumn?.setFilterValue(
                                            range?.from
                                                ? [
                                                      startOfDay(
                                                          range.from,
                                                      ).getTime(),
                                                      endOfDay(
                                                          range.to ??
                                                              range.from,
                                                      ).getTime(),
                                                  ]
                                                : undefined,
                                        );
                                    }}
                                    placeholder="Any time"
                                    value={dateRange}
                                />
                            </div>
                        </div>
                    );
                }}
                isLoading={workouts.isLoading}
                pageSize={20}
                rowId={(r) => r.id}
                showFilter
            />

            {editing && (
                <WorkoutEditDialog
                    initial={editing}
                    onClose={() => setEditing(null)}
                    onSubmit={async (values) => {
                        await update.mutateAsync({
                            bodyweightKg: values.bodyweightKg,
                            id: editing.id,
                            name: values.name,
                            notes: values.notes,
                        });
                        setEditing(null);
                    }}
                    pending={update.isPending}
                />
            )}
        </div>
    );
}

function durationSeconds(w: WorkoutRow): null | number {
    if (!w.endedAt) return null;
    return Math.round(
        (new Date(w.endedAt).getTime() - new Date(w.startedAt).getTime()) /
            1000,
    );
}

function WorkoutEditDialog({
    initial,
    onClose,
    onSubmit,
    pending,
}: {
    initial: WorkoutRow;
    onClose: () => void;
    onSubmit: (values: WorkoutEditValues) => Promise<unknown>;
    pending: boolean;
}) {
    const form = useForm<WorkoutEditValues>({
        defaultValues: {
            bodyweightKg: initial.bodyweightKg ?? null,
            name: initial.name ?? null,
            notes: initial.notes ?? null,
        },
        mode: 'onTouched',
        resolver: zodResolver(workoutEditSchema),
    });

    useEffect(() => {
        form.reset({
            bodyweightKg: initial.bodyweightKg ?? null,
            name: initial.name ?? null,
            notes: initial.notes ?? null,
        });
    }, [initial, form]);

    const submit = form.handleSubmit(async (values) => {
        await onSubmit(values);
    });

    return (
        <Dialog
            onOpenChange={(o) => {
                if (!o) onClose();
            }}
            open
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit workout</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form className="flex flex-col gap-4" onSubmit={submit}>
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Name</FormLabel>
                                    <FormControl>
                                        <Input
                                            onChange={(event) =>
                                                field.onChange(
                                                    event.target.value === ''
                                                        ? null
                                                        : event.target.value,
                                                )
                                            }
                                            ref={field.ref}
                                            value={field.value ?? ''}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="bodyweightKg"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Bodyweight (kg)</FormLabel>
                                    <FormControl>
                                        <Input
                                            inputMode="decimal"
                                            onChange={(event) => {
                                                if (event.target.value === '') {
                                                    field.onChange(null);
                                                    return;
                                                }
                                                const n = Number(
                                                    event.target.value,
                                                );
                                                field.onChange(
                                                    Number.isFinite(n)
                                                        ? n
                                                        : null,
                                                );
                                            }}
                                            ref={field.ref}
                                            step="0.1"
                                            type="number"
                                            value={field.value ?? ''}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="notes"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Notes</FormLabel>
                                    <FormControl>
                                        <Textarea
                                            onChange={(event) =>
                                                field.onChange(
                                                    event.target.value === ''
                                                        ? null
                                                        : event.target.value,
                                                )
                                            }
                                            ref={field.ref}
                                            rows={4}
                                            value={field.value ?? ''}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <DialogFooter>
                            <Button
                                onClick={onClose}
                                type="button"
                                variant="ghost"
                            >
                                Cancel
                            </Button>
                            <Button disabled={pending} type="submit">
                                {pending ? 'Saving…' : 'Save'}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
