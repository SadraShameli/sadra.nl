'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Calendar, ExternalLink, Pencil, Play } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { ProfileFormDialog } from '~/app/(app)/profile/_components/ProfileFormDialog';
import { ProfilePanel } from '~/app/(app)/profile/_components/ProfilePanel';
import {
    MutedCell,
    PrimaryCell,
    profileActionsColumn,
    ProfileDateCell,
    ProfileDatePrecision,
    ProfileTableEmpty,
    RowActionButton,
    RowActionLink,
    RowConfirmAction,
} from '~/app/(app)/profile/_components/ProfileTable';
import { Button } from '~/components/ui/button';
import {
    DataTable,
    type DataTableColumn,
    DataTableFilterFunction,
    type DataTableInstance,
    hasActiveTableFilter,
} from '~/components/ui/data-table';
import { DataTableDateRange } from '~/components/ui/data-table-date-range';
import { DataTableFacetSelect } from '~/components/ui/data-table-facet-select';
import { Dialog } from '~/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '~/components/ui/field';
import { FilterSelect } from '~/components/ui/filter-select';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import { DurationFormat } from '~/lib/lifting/format';
import {
    WORKOUT_DURATION_BUCKETS,
    WorkoutDuration,
} from '~/lib/lifting/workout-duration';
import { routes } from '~/lib/site/routes';
import { api, type RouterOutputs } from '~/trpc/react';

type WorkoutRow = RouterOutputs['lifting']['workout']['list'][number];

const WorkoutColumn = {
    Date: 'date',
    Duration: 'duration',
    Status: 'status',
} as const;

const WorkoutStatus = {
    Completed: 'completed',
    InProgress: 'in-progress',
} as const;

const WORKOUT_STATUS_LABEL = new Map<string, string>([
    [WorkoutStatus.Completed, 'Completed'],
    [WorkoutStatus.InProgress, 'In progress'],
]);

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

    const rows = useMemo(() => workouts.data ?? [], [workouts.data]);

    const columns = useMemo<DataTableColumn<WorkoutRow>[]>(
        () => [
            {
                accessorKey: 'name',
                cell: ({ row }) => (
                    <Link
                        className="hover:underline"
                        href={routes.lifting.workout(row.original.id)}
                    >
                        <PrimaryCell>
                            {row.original.name ?? 'Workout'}
                        </PrimaryCell>
                    </Link>
                ),
                header: 'Workout',
            },
            {
                accessorFn: (r) => new Date(r.startedAt).getTime(),
                cell: ({ row }) => (
                    <ProfileDateCell
                        precision={ProfileDatePrecision.Day}
                        value={new Date(row.original.startedAt)}
                    />
                ),
                filterFn: DataTableFilterFunction.InNumberRange,
                header: 'Date',
                id: WorkoutColumn.Date,
            },
            {
                accessorFn: (r) => WorkoutDuration.seconds(r) ?? -1,
                cell: ({ row }) => {
                    const dur = WorkoutDuration.seconds(row.original);
                    return (
                        <MutedCell>
                            {dur === null ? '-' : DurationFormat.seconds(dur)}
                        </MutedCell>
                    );
                },
                filterFn: DataTableFilterFunction.InNumberRange,
                header: 'Duration',
                id: WorkoutColumn.Duration,
            },
            {
                accessorFn: (r) =>
                    r.endedAt
                        ? WorkoutStatus.Completed
                        : WorkoutStatus.InProgress,
                cell: ({ getValue }) => (
                    <MutedCell>
                        {workoutStatusLabel(String(getValue()))}
                    </MutedCell>
                ),
                filterFn: DataTableFilterFunction.Equals,
                header: 'Status',
                id: WorkoutColumn.Status,
            },
            profileActionsColumn<WorkoutRow>((workout) => (
                <>
                    <RowActionLink
                        href={routes.lifting.workout(workout.id)}
                        icon={ExternalLink}
                        label="Open workout"
                    />
                    <RowActionButton
                        icon={Pencil}
                        label="Edit workout"
                        onClick={() => setEditing(workout)}
                    />
                    <RowConfirmAction
                        description="Removes the workout and all its sets permanently."
                        label="Delete workout"
                        onConfirm={() => remove.mutate({ id: workout.id })}
                        title={`Delete “${workout.name ?? 'Workout'}”?`}
                    />
                </>
            )),
        ],
        [remove],
    );

    const logButton = (
        <Button asChild size="sm">
            <Link href={routes.lifting.log}>
                <Play className="size-4" />
                Start workout
            </Link>
        </Button>
    );

    return (
        <>
            <ProfilePanel
                action={logButton}
                description="Every workout you logged. Edit the details here or open one to manage its sets."
                title="Workouts"
            >
                <DataTable
                    columns={columns}
                    data={rows}
                    emptyState={(table) => (
                        <ProfileTableEmpty
                            action={logButton}
                            description="Start a workout from the log."
                            filtered={hasActiveTableFilter(table)}
                            icon={Calendar}
                            noun="workouts"
                        />
                    )}
                    filterPlaceholder="Search workouts…"
                    headerActions={(table) => (
                        <>
                            <DataTableFacetSelect
                                column={table.getColumn(WorkoutColumn.Status)}
                                format={workoutStatusLabel}
                                label="Status"
                                placeholder="All statuses"
                            />
                            <DurationSelect table={table} />
                            <DataTableDateRange
                                align="end"
                                column={table.getColumn(WorkoutColumn.Date)}
                                label="Workout date"
                                maxDate={new Date()}
                                placeholder="Any time"
                            />
                        </>
                    )}
                    isLoading={workouts.isLoading}
                    pageSize={20}
                    rowId={(r) => r.id}
                    showFilter
                />
            </ProfilePanel>

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
        </>
    );
}

function DurationSelect({ table }: { table: DataTableInstance<WorkoutRow> }) {
    const column = table.getColumn(WorkoutColumn.Duration);
    if (!column) return null;
    const current = column.getFilterValue();
    const selected = WorkoutDuration.bucketForFilterValue(current);
    return (
        <FilterSelect
            label="Duration"
            onValueChange={(value) =>
                column.setFilterValue(
                    WorkoutDuration.bucketForValue(value)?.range,
                )
            }
            options={WORKOUT_DURATION_BUCKETS}
            placeholder="Any duration"
            value={selected?.value}
        />
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
    const formId = useId();

    useEffect(() => {
        form.reset({
            bodyweightKg: initial.bodyweightKg ?? null,
            name: initial.name ?? null,
            notes: initial.notes ?? null,
        });
    }, [initial, form]);

    return (
        <Dialog
            onOpenChange={(o) => {
                if (!o) onClose();
            }}
            open
        >
            <ProfileFormDialog
                form={form}
                onCancel={onClose}
                onSubmit={onSubmit}
                pending={pending}
                submitLabel="Save"
                title="Edit workout"
            >
                <Controller
                    control={form.control}
                    name="name"
                    render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor={`${formId}-name`}>
                                Name
                            </FieldLabel>
                            <Input
                                aria-invalid={fieldState.invalid}
                                id={`${formId}-name`}
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
                            <FieldError errors={[fieldState.error]} />
                        </Field>
                    )}
                />
                <Controller
                    control={form.control}
                    name="bodyweightKg"
                    render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor={`${formId}-bodyweightKg`}>
                                Bodyweight (kg)
                            </FieldLabel>
                            <Input
                                aria-invalid={fieldState.invalid}
                                id={`${formId}-bodyweightKg`}
                                inputMode="decimal"
                                onChange={(event) => {
                                    if (event.target.value === '') {
                                        field.onChange(null);
                                        return;
                                    }
                                    const n = Number(event.target.value);
                                    field.onChange(
                                        Number.isFinite(n) ? n : null,
                                    );
                                }}
                                ref={field.ref}
                                step="0.1"
                                type="number"
                                value={field.value ?? ''}
                            />
                            <FieldError errors={[fieldState.error]} />
                        </Field>
                    )}
                />
                <Controller
                    control={form.control}
                    name="notes"
                    render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor={`${formId}-notes`}>
                                Notes
                            </FieldLabel>
                            <Textarea
                                aria-invalid={fieldState.invalid}
                                id={`${formId}-notes`}
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
                            <FieldError errors={[fieldState.error]} />
                        </Field>
                    )}
                />
            </ProfileFormDialog>
        </Dialog>
    );
}

function workoutStatusLabel(value: string): string {
    return WORKOUT_STATUS_LABEL.get(value) ?? value;
}
