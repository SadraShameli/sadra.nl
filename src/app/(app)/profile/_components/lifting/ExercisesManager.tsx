'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Dumbbell, Plus } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { type z } from 'zod';

import {
    MutedCell,
    PrimaryCell,
    ProfileTableEmpty,
} from '~/app/(app)/profile/_components/ProfileTable';
import { FormDialog } from '~/components/FormDialog';
import { FormTextField } from '~/components/FormFields';
import {
    deleteRowAction,
    editRowAction,
    rowActionsColumn,
} from '~/components/RowActionsMenu';
import { ToolPanel } from '~/components/ToolPanel';
import { Button } from '~/components/ui/button';
import {
    DataTable,
    type DataTableColumn,
    DataTableFilterFunction,
    hasActiveTableFilter,
} from '~/components/ui/data-table';
import { DataTableFacetSelect } from '~/components/ui/data-table-facet-select';
import { Dialog } from '~/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '~/components/ui/field';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/select';
import {
    type CreateCustomExerciseInput,
    customExerciseInputSchema,
} from '~/lib/lifting/schemas';
import {
    EQUIPMENT_VALUES,
    FORCE_VALUES,
    MECHANIC_VALUES,
    MUSCLE_VALUES,
} from '~/lib/lifting/types';
import { api, type RouterOutputs } from '~/trpc/react';

type ExerciseFormInput = z.input<typeof customExerciseInputSchema>;
type ExerciseRow = RouterOutputs['lifting']['exercise']['list'][number];

const ExerciseColumn = {
    Equipment: 'equipment',
    Muscle: 'primaryMuscle',
} as const;

const DEFAULTS: CreateCustomExerciseInput = {
    equipment: 'barbell',
    force: 'push',
    mechanic: 'compound',
    name: '',
    primaryMuscle: 'chest',
    secondaryMuscles: [],
    tags: [],
};

interface ExerciseDialogProperties {
    initial?: CreateCustomExerciseInput;
    onClose: () => void;
    onSubmit: (values: CreateCustomExerciseInput) => Promise<unknown>;
    open: boolean;
    pending: boolean;
    submitLabel: string;
    title: string;
}

export function ExercisesManager() {
    const utilities = api.useUtils();
    const query = api.lifting.exercise.list.useQuery({
        includeCustom: true,
        limit: 500,
        offset: 0,
    });

    const create = api.lifting.exercise.createCustom.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Exercise created');
            await utilities.lifting.exercise.list.invalidate();
        },
    });
    const update = api.lifting.exercise.updateCustom.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Exercise updated');
            await utilities.lifting.exercise.list.invalidate();
        },
    });
    const remove = api.lifting.exercise.deleteCustom.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Exercise deleted');
            await utilities.lifting.exercise.list.invalidate();
        },
    });

    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editing, setEditing] = useState<ExerciseRow | null>(null);

    const rows = useMemo(
        () => (query.data ?? []).filter((exercise) => exercise.isCustom),
        [query.data],
    );

    const columns = useMemo<DataTableColumn<ExerciseRow>[]>(
        () => [
            {
                accessorKey: 'name',
                cell: ({ row }) => (
                    <PrimaryCell>{row.original.name}</PrimaryCell>
                ),
                header: 'Name',
                meta: { isRowHeader: true },
            },
            {
                accessorKey: ExerciseColumn.Muscle,
                cell: ({ row }) => (
                    <MutedCell className="capitalize">
                        {row.original.primaryMuscle}
                    </MutedCell>
                ),
                filterFn: DataTableFilterFunction.Equals,
                header: 'Muscle',
            },
            {
                accessorKey: ExerciseColumn.Equipment,
                cell: ({ row }) => (
                    <MutedCell className="capitalize">
                        {row.original.equipment}
                    </MutedCell>
                ),
                filterFn: DataTableFilterFunction.Equals,
                header: 'Equipment',
            },
            rowActionsColumn<ExerciseRow>({
                actionsOf: (exercise) => [
                    editRowAction(() => setEditing(exercise)),
                    deleteRowAction({
                        description:
                            "Workouts referencing this exercise keep their logged sets, but the exercise can't be selected anymore.",
                        onDelete: () => remove.mutate({ id: exercise.id }),
                        title: `Delete “${exercise.name}”?`,
                    }),
                ],
                isPendingOf: (exercise) =>
                    remove.isPending && remove.variables.id === exercise.id,
                labelOf: (exercise) => exercise.name,
            }),
        ],
        [remove],
    );

    const newButton = (
        <Button onClick={() => setIsCreateOpen(true)} size="sm">
            <Plus className="size-4" />
            New exercise
        </Button>
    );

    return (
        <>
            <ToolPanel
                actions={newButton}
                description="Your own exercises. Built-in exercises are managed centrally."
                title="Exercises"
            >
                <DataTable
                    columns={columns}
                    data={rows}
                    emptyState={(table) => (
                        <ProfileTableEmpty
                            action={newButton}
                            description="Add an exercise the built-in library is missing."
                            filtered={hasActiveTableFilter(table)}
                            icon={Dumbbell}
                            noun="custom exercises"
                        />
                    )}
                    filterPlaceholder="Search exercises…"
                    headerActions={(table) => (
                        <>
                            <DataTableFacetSelect
                                column={table.getColumn(ExerciseColumn.Muscle)}
                                format={capitalized}
                                label="Muscle"
                                placeholder="All muscles"
                            />
                            <DataTableFacetSelect
                                column={table.getColumn(
                                    ExerciseColumn.Equipment,
                                )}
                                format={capitalized}
                                label="Equipment"
                                placeholder="All equipment"
                            />
                        </>
                    )}
                    isLoading={query.isLoading}
                    rowId={(r) => r.id}
                    showFilter
                />
            </ToolPanel>

            <ExerciseDialog
                onClose={() => setIsCreateOpen(false)}
                onSubmit={async (values) => {
                    await create.mutateAsync(values);
                    setIsCreateOpen(false);
                }}
                open={isCreateOpen}
                pending={create.isPending}
                submitLabel="Create"
                title="New exercise"
            />
            {editing && (
                <ExerciseDialog
                    initial={{
                        equipment: editing.equipment,
                        force: editing.force,
                        mechanic: editing.mechanic,
                        name: editing.name,
                        primaryMuscle: editing.primaryMuscle,
                        secondaryMuscles: editing.secondaryMuscles,
                        tags: editing.tags,
                    }}
                    onClose={() => setEditing(null)}
                    onSubmit={async (values) => {
                        await update.mutateAsync({
                            ...values,
                            id: editing.id,
                        });
                        setEditing(null);
                    }}
                    open
                    pending={update.isPending}
                    submitLabel="Save"
                    title="Edit exercise"
                />
            )}
        </>
    );
}

function capitalized(value: string) {
    return <span className="capitalize">{value}</span>;
}

function EnumSelect({
    control,
    label,
    name,
    values,
}: {
    control: ReturnType<
        typeof useForm<ExerciseFormInput, unknown, CreateCustomExerciseInput>
    >['control'];
    label: string;
    name: 'equipment' | 'force' | 'mechanic' | 'primaryMuscle';
    values: readonly string[];
}) {
    const formId = useId();
    return (
        <Controller
            control={control}
            name={name}
            render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={`${formId}-${field.name}`}>
                        {label}
                    </FieldLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger
                            aria-invalid={fieldState.invalid}
                            id={`${formId}-${field.name}`}
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {values.map((v) => (
                                <SelectItem key={v} value={v}>
                                    <span className="capitalize">{v}</span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <FieldError errors={[fieldState.error]} />
                </Field>
            )}
        />
    );
}

function ExerciseDialog({
    initial,
    onClose,
    onSubmit,
    open,
    pending,
    submitLabel,
    title,
}: ExerciseDialogProperties) {
    const form = useForm<ExerciseFormInput, unknown, CreateCustomExerciseInput>(
        {
            defaultValues: initial ?? DEFAULTS,
            mode: 'onTouched',
            resolver: zodResolver(customExerciseInputSchema),
        },
    );

    useEffect(() => {
        if (open) form.reset(initial ?? DEFAULTS);
    }, [open, initial, form]);

    return (
        <Dialog
            onOpenChange={(o) => {
                if (!o) onClose();
            }}
            open={open}
        >
            <FormDialog
                form={form}
                onCancel={onClose}
                onSubmit={onSubmit}
                pending={pending}
                submitLabel={submitLabel}
                title={title}
            >
                <FormTextField
                    control={form.control}
                    label="Name"
                    name="name"
                />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <EnumSelect
                        control={form.control}
                        label="Primary muscle"
                        name="primaryMuscle"
                        values={MUSCLE_VALUES}
                    />
                    <EnumSelect
                        control={form.control}
                        label="Equipment"
                        name="equipment"
                        values={EQUIPMENT_VALUES}
                    />
                    <EnumSelect
                        control={form.control}
                        label="Force"
                        name="force"
                        values={FORCE_VALUES}
                    />
                    <EnumSelect
                        control={form.control}
                        label="Mechanic"
                        name="mechanic"
                        values={MECHANIC_VALUES}
                    />
                </div>
            </FormDialog>
        </Dialog>
    );
}
