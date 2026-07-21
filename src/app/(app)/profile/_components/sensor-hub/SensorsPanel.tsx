'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type ColumnDef } from '@tanstack/react-table';
import { Check, Pencil, Plus, Radio, Ruler, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
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
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import { DataTable } from '~/components/ui/DataTable';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
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
import { Separator } from '~/components/ui/Separator';
import {
    type SensorCreateInput,
    sensorCreateSchema,
    type SensorUnitCreateInput,
    sensorUnitCreateSchema,
    type SensorUnitUpdateInput,
    sensorUnitUpdateSchema,
} from '~/lib/schemas/sensor-hub';
import { api } from '~/trpc/react';

type SensorRow = {
    created_at: Date;
    id: number;
    name: string;
    unit: string;
};

type UnitRow = { id: number; value: string };

export function SensorsPanel() {
    const utilities = api.useUtils();
    const sensors = api.sensor.listAdmin.useQuery();
    const units = api.sensorUnit.list.useQuery();
    const create = api.sensor.create.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Sensor created.');
            await utilities.sensor.listAdmin.invalidate();
        },
    });
    const update = api.sensor.update.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Sensor updated.');
            await utilities.sensor.listAdmin.invalidate();
        },
    });
    const del = api.sensor.delete.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Sensor deleted.');
            await utilities.sensor.listAdmin.invalidate();
        },
    });

    const [newOpen, setNewOpen] = useState(false);
    const [editing, setEditing] = useState<null | SensorRow>(null);
    const [unitsOpen, setUnitsOpen] = useState(false);

    const rows = sensors.data ?? [];
    const unitOptions = units.data ?? [];

    const columns = useMemo<ColumnDef<SensorRow>[]>(
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
                accessorKey: 'unit',
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground">
                        {row.original.unit}
                    </span>
                ),
                header: 'Unit',
            },
            {
                accessorKey: 'created_at',
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground">
                        {new Date(row.original.created_at).toLocaleDateString()}
                    </span>
                ),
                header: 'Created',
            },
            {
                cell: ({ row }) => (
                    <div className="flex justify-end gap-2">
                        <Button
                            onClick={() => setEditing(row.original)}
                            size="sm"
                            variant="outline"
                        >
                            <Pencil className="size-3.5" />
                        </Button>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button size="sm" variant="outline">
                                    <Trash2 className="size-3.5" />
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>
                                        Delete sensor &ldquo;{row.original.name}
                                        &rdquo;?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Removes its device mappings. Fails if
                                        readings reference it.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>
                                        Cancel
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={() =>
                                            del.mutate({
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
                header: () => <span className="sr-only">Actions</span>,
                id: 'actions',
            },
        ],
        [del],
    );

    return (
        <Card>
            <CardHeader>
                <CardTitle>Sensors</CardTitle>
                <div className="flex flex-wrap gap-2">
                    <Dialog onOpenChange={setUnitsOpen} open={unitsOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm" variant="outline">
                                <Ruler className="mr-1 size-4" />
                                Manage units
                            </Button>
                        </DialogTrigger>
                        <UnitsManagerDialog
                            onClose={() => setUnitsOpen(false)}
                            units={unitOptions}
                        />
                    </Dialog>
                    <Dialog onOpenChange={setNewOpen} open={newOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm">
                                <Plus className="mr-1 size-4" />
                                New sensor
                            </Button>
                        </DialogTrigger>
                        <SensorDialog
                            initial={null}
                            onClose={() => setNewOpen(false)}
                            onSubmit={(v) =>
                                create.mutate(v, {
                                    onSuccess: () => setNewOpen(false),
                                })
                            }
                            pending={create.isPending}
                            units={unitOptions}
                        />
                    </Dialog>
                </div>
            </CardHeader>
            <Separator />
            <CardContent>
                <DataTable
                    columns={columns}
                    data={rows}
                    emptyState={
                        <EmptyState
                            description="Add a sensor to track readings from your devices."
                            icon={Radio}
                            title="No sensors yet"
                        />
                    }
                    isLoading={sensors.isLoading}
                    rowId={(r) => String(r.id)}
                    showFilter
                />
            </CardContent>

            <Dialog
                onOpenChange={(o) => !o && setEditing(null)}
                open={editing !== null}
            >
                {editing && (
                    <SensorDialog
                        initial={editing}
                        onClose={() => setEditing(null)}
                        onSubmit={(v) =>
                            update.mutate(
                                { ...v, id: editing.id },
                                { onSuccess: () => setEditing(null) },
                            )
                        }
                        pending={update.isPending}
                        units={unitOptions}
                    />
                )}
            </Dialog>
        </Card>
    );
}

function SensorDialog({
    initial,
    onClose,
    onSubmit,
    pending,
    units,
}: {
    initial: null | SensorRow;
    onClose: () => void;
    onSubmit: (v: SensorCreateInput) => void;
    pending: boolean;
    units: UnitRow[];
}) {
    const form = useForm<SensorCreateInput>({
        defaultValues: {
            name: initial?.name ?? '',
            unit: initial?.unit ?? units[0]?.value ?? '',
        },
        resolver: zodResolver(sensorCreateSchema),
    });
    return (
        <DialogContent>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                    <DialogHeader>
                        <DialogTitle>
                            {initial ? 'Edit sensor' : 'New sensor'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="mt-4 flex flex-col gap-3">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Name</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="Temperature"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="unit"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Unit</FormLabel>
                                    <Select
                                        onValueChange={field.onChange}
                                        value={field.value}
                                    >
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Pick a unit" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {units.map((u) => (
                                                <SelectItem
                                                    key={u.id}
                                                    value={u.value}
                                                >
                                                    {u.value}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                    <DialogFooter className="mt-4">
                        <Button onClick={onClose} type="button" variant="ghost">
                            Cancel
                        </Button>
                        <Button
                            disabled={pending || units.length === 0}
                            type="submit"
                        >
                            {initial ? 'Save' : 'Create'}
                        </Button>
                    </DialogFooter>
                </form>
            </Form>
        </DialogContent>
    );
}

function UnitRowEditor({
    invalidate,
    onDelete,
    unit,
}: {
    invalidate: () => Promise<void>;
    onDelete: () => void;
    unit: UnitRow;
}) {
    const [editing, setEditing] = useState(false);
    const update = api.sensorUnit.update.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Unit renamed.');
            setEditing(false);
            await invalidate();
        },
    });
    const form = useForm<SensorUnitUpdateInput>({
        defaultValues: { id: unit.id, value: unit.value },
        resolver: zodResolver(sensorUnitUpdateSchema),
    });
    if (!editing) {
        return (
            <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-3 py-2">
                <span className="font-mono text-sm text-white">
                    {unit.value}
                </span>
                <div className="flex gap-1">
                    <Button
                        onClick={() => setEditing(true)}
                        size="sm"
                        variant="ghost"
                    >
                        <Pencil className="size-3.5" />
                    </Button>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost">
                                <Trash2 className="size-3.5" />
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>
                                    Delete unit &ldquo;{unit.value}&rdquo;?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                    Fails if any sensor still uses this unit.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={onDelete}>
                                    Delete
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </div>
        );
    }

    const onSubmit = form.handleSubmit((values) => update.mutate(values));

    return (
        <Form {...form}>
            <form
                className="flex items-center gap-2 rounded-md border border-border/60 bg-background px-2 py-2"
                onSubmit={onSubmit}
            >
                <FormField
                    control={form.control}
                    name="value"
                    render={({ field }) => (
                        <FormItem className="flex-1">
                            <FormControl>
                                <Input
                                    className="h-8 font-mono text-sm"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <Button
                    disabled={update.isPending}
                    size="sm"
                    type="submit"
                    variant="outline"
                >
                    <Check className="size-3.5" />
                </Button>
                <Button
                    onClick={() => {
                        form.reset({ id: unit.id, value: unit.value });
                        setEditing(false);
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                >
                    <X className="size-3.5" />
                </Button>
            </form>
        </Form>
    );
}

function UnitsManagerDialog({
    onClose,
    units,
}: {
    onClose: () => void;
    units: UnitRow[];
}) {
    const utilities = api.useUtils();
    const invalidate = async () => {
        await Promise.all([
            utilities.sensorUnit.list.invalidate(),
            utilities.sensor.listAdmin.invalidate(),
        ]);
    };
    const create = api.sensorUnit.create.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Unit added.');
            await invalidate();
        },
    });
    const del = api.sensorUnit.delete.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Unit deleted.');
            await invalidate();
        },
    });
    const unitCreateForm = useForm<SensorUnitCreateInput>({
        defaultValues: { value: '' },
        resolver: zodResolver(sensorUnitCreateSchema),
    });
    const onAdd = unitCreateForm.handleSubmit((values) => {
        create.mutate(values, {
            onSuccess: () => unitCreateForm.reset({ value: '' }),
        });
    });

    return (
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Manage units</DialogTitle>
            </DialogHeader>
            <Form {...unitCreateForm}>
                <form className="mt-2 flex flex-col gap-3" onSubmit={onAdd}>
                    <FormField
                        control={unitCreateForm.control}
                        name="value"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>New unit</FormLabel>
                                <div className="flex gap-2">
                                    <FormControl>
                                        <Input
                                            placeholder="e.g. lux"
                                            {...field}
                                        />
                                    </FormControl>
                                    <Button
                                        disabled={create.isPending}
                                        type="submit"
                                    >
                                        <Plus className="mr-1 size-4" />
                                        Add
                                    </Button>
                                </div>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </form>
            </Form>

            <Separator className="my-2" />

            <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
                {units.length === 0 && (
                    <p className="py-2 text-center text-sm text-muted-foreground">
                        No units yet.
                    </p>
                )}
                {units.map((u) => (
                    <UnitRowEditor
                        invalidate={invalidate}
                        key={u.id}
                        onDelete={() => del.mutate({ id: u.id })}
                        unit={u}
                    />
                ))}
            </div>

            <DialogFooter className="mt-2">
                <Button onClick={onClose} type="button" variant="ghost">
                    Close
                </Button>
            </DialogFooter>
        </DialogContent>
    );
}
