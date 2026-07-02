'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type ColumnDef } from '@tanstack/react-table';
import { Dumbbell, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { type z } from 'zod';

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
import { DataTable } from '~/components/ui/DataTable';
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
import {
    type CreateCustomExerciseInput,
    createCustomExerciseInputSchema,
} from '~/lib/lifting/schemas';
import {
    EQUIPMENT_VALUES,
    FORCE_VALUES,
    MECHANIC_VALUES,
    MUSCLE_VALUES,
} from '~/lib/lifting/types';
import { api, type RouterOutputs } from '~/trpc/react';

type ExerciseFormInput = z.input<typeof createCustomExerciseInputSchema>;
type ExerciseRow = RouterOutputs['lifting']['exercise']['list'][number];

const FILTER_ALL = '__all__';

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

    const [createOpen, setCreateOpen] = useState(false);
    const [editing, setEditing] = useState<ExerciseRow | null>(null);
    const [muscleFilter, setMuscleFilter] = useState<string>(FILTER_ALL);
    const [equipmentFilter, setEquipmentFilter] = useState<string>(FILTER_ALL);

    const rows = useMemo(
        () =>
            (query.data ?? []).filter((e) => {
                if (!e.isCustom) return false;
                if (
                    muscleFilter !== FILTER_ALL &&
                    e.primaryMuscle !== muscleFilter
                )
                    return false;
                return (
                    equipmentFilter === FILTER_ALL ||
                    e.equipment === equipmentFilter
                );
            }),
        [query.data, muscleFilter, equipmentFilter],
    );

    const hasFilters =
        muscleFilter !== FILTER_ALL || equipmentFilter !== FILTER_ALL;
    const resetFilters = () => {
        setMuscleFilter(FILTER_ALL);
        setEquipmentFilter(FILTER_ALL);
    };

    const columns = useMemo<ColumnDef<ExerciseRow>[]>(
        () => [
            {
                accessorKey: 'name',
                cell: ({ row }) => (
                    <span className="font-medium text-white">
                        {row.original.name}
                    </span>
                ),
                header: 'Name',
            },
            {
                accessorKey: 'primaryMuscle',
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground capitalize">
                        {row.original.primaryMuscle}
                    </span>
                ),
                header: 'Muscle',
            },
            {
                accessorKey: 'equipment',
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground capitalize">
                        {row.original.equipment}
                    </span>
                ),
                header: 'Equipment',
            },
            {
                cell: ({ row }) => (
                    <div className="flex items-center justify-end gap-2">
                        <Button
                            aria-label="Edit exercise"
                            onClick={() => setEditing(row.original)}
                            size="sm"
                            variant="outline"
                        >
                            <Pencil className="size-3.5" />
                        </Button>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button
                                    aria-label="Delete exercise"
                                    size="sm"
                                    variant="outline"
                                >
                                    <Trash2 className="size-3.5" />
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>
                                        Delete &ldquo;{row.original.name}
                                        &rdquo;?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Workouts referencing this exercise will
                                        keep their logged sets, but the exercise
                                        can&apos;t be selected anymore.
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
            <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                    Custom exercises you&apos;ve added. Built-in exercises are
                    managed centrally.
                </p>
                <Button
                    className="gap-1"
                    onClick={() => setCreateOpen(true)}
                    size="sm"
                >
                    <Plus className="size-4" /> New exercise
                </Button>
            </div>

            <DataTable
                belowFilter={
                    <ClearFiltersButton
                        active={hasFilters}
                        onReset={resetFilters}
                    />
                }
                columns={columns}
                data={rows}
                emptyState={
                    <EmptyState
                        description={
                            hasFilters
                                ? 'No exercises match these filters.'
                                : 'Create one from the New exercise button.'
                        }
                        icon={Dumbbell}
                        title={
                            hasFilters
                                ? 'No matches'
                                : 'No custom exercises yet'
                        }
                    />
                }
                filterPlaceholder="Search exercises…"
                filterPosition="bottom"
                headerActions={
                    <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:flex-wrap md:items-end">
                        <div className="flex flex-col gap-1">
                            <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
                                Muscle
                            </span>
                            <Select
                                onValueChange={setMuscleFilter}
                                value={muscleFilter}
                            >
                                <SelectTrigger className="h-8 w-36 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={FILTER_ALL}>
                                        All muscles
                                    </SelectItem>
                                    {MUSCLE_VALUES.map((m) => (
                                        <SelectItem key={m} value={m}>
                                            <span className="capitalize">
                                                {m}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
                                Equipment
                            </span>
                            <Select
                                onValueChange={setEquipmentFilter}
                                value={equipmentFilter}
                            >
                                <SelectTrigger className="h-8 w-36 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={FILTER_ALL}>
                                        All gear
                                    </SelectItem>
                                    {EQUIPMENT_VALUES.map((e) => (
                                        <SelectItem key={e} value={e}>
                                            <span className="capitalize">
                                                {e}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                }
                isLoading={query.isLoading}
                rowId={(r) => r.id}
                showFilter
            />

            <ExerciseDialog
                onClose={() => setCreateOpen(false)}
                onSubmit={async (values) => {
                    await create.mutateAsync(values);
                    setCreateOpen(false);
                }}
                open={createOpen}
                pending={create.isPending}
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
                    title="Edit exercise"
                />
            )}
        </div>
    );
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
    title,
}: ExerciseDialogProperties) {
    const form = useForm<ExerciseFormInput, unknown, CreateCustomExerciseInput>(
        {
            defaultValues: initial ?? DEFAULTS,
            mode: 'onTouched',
            resolver: zodResolver(createCustomExerciseInputSchema),
        },
    );

    useEffect(() => {
        if (open) form.reset(initial ?? DEFAULTS);
    }, [open, initial, form]);

    const submit = form.handleSubmit(async (values) => {
        await onSubmit(values);
    });

    return (
        <Dialog
            onOpenChange={(o) => {
                if (!o) onClose();
            }}
            open={open}
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
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
                                        <Input autoComplete="off" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
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
