'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Dumbbell, Pencil, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { type z } from 'zod';

import { ProfileFormDialog } from '~/app/(app)/profile/_components/ProfileFormDialog';
import { ProfileTextField } from '~/app/(app)/profile/_components/ProfileFormFields';
import { ProfilePanel } from '~/app/(app)/profile/_components/ProfilePanel';
import {
    MutedCell,
    PrimaryCell,
    profileActionsColumn,
    ProfileTableEmpty,
    RowActionButton,
    RowConfirmAction,
} from '~/app/(app)/profile/_components/ProfileTable';
import { Button } from '~/components/ui/Button';
import {
    DataTable,
    type DataTableColumn,
    DataTableFilterFunction,
    hasActiveTableFilter,
} from '~/components/ui/DataTable';
import { DataTableFacetSelect } from '~/components/ui/DataTableFacetSelect';
import { Dialog } from '~/components/ui/Dialog';
import {
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '~/components/ui/Form';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
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
            profileActionsColumn<ExerciseRow>((exercise) => (
                <>
                    <RowActionButton
                        icon={Pencil}
                        label="Edit exercise"
                        onClick={() => setEditing(exercise)}
                    />
                    <RowConfirmAction
                        description="Workouts referencing this exercise keep their logged sets, but the exercise can't be selected anymore."
                        label="Delete exercise"
                        onConfirm={() => remove.mutate({ id: exercise.id })}
                        title={`Delete “${exercise.name}”?`}
                    />
                </>
            )),
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
            <ProfilePanel
                action={newButton}
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
            </ProfilePanel>

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
    return (
        <FormField
            control={control}
            name={name}
            render={({ field }) => (
                <FormItem>
                    <FormLabel>{label}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            {values.map((v) => (
                                <SelectItem key={v} value={v}>
                                    <span className="capitalize">{v}</span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                </FormItem>
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
            <ProfileFormDialog
                form={form}
                onCancel={onClose}
                onSubmit={onSubmit}
                pending={pending}
                submitLabel={submitLabel}
                title={title}
            >
                <ProfileTextField
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
            </ProfileFormDialog>
        </Dialog>
    );
}
