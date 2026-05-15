'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
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
import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import { Separator } from '~/components/ui/Separator';
import {
    type SensorCreateInput,
    sensorCreateSchema,
} from '~/lib/schemas/sensor-hub';
import { api } from '~/trpc/react';

type SensorRow = {
    created_at: Date;
    id: number;
    name: string;
    unit: string;
};

export function SensorsPanel() {
    const utils = api.useUtils();
    const sensors = api.sensor.listAdmin.useQuery();
    const create = api.sensor.create.useMutation({
        onError: (err) => toast.error(err.message),
        onSuccess: async () => {
            toast.success('Sensor created.');
            await utils.sensor.listAdmin.invalidate();
        },
    });
    const update = api.sensor.update.useMutation({
        onError: (err) => toast.error(err.message),
        onSuccess: async () => {
            toast.success('Sensor updated.');
            await utils.sensor.listAdmin.invalidate();
        },
    });
    const del = api.sensor.delete.useMutation({
        onError: (err) => toast.error(err.message),
        onSuccess: async () => {
            toast.success('Sensor deleted.');
            await utils.sensor.listAdmin.invalidate();
        },
    });

    const [newOpen, setNewOpen] = useState(false);
    const [editing, setEditing] = useState<null | SensorRow>(null);

    const rows = sensors.data ?? [];

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
                    />
                </Dialog>
            </CardHeader>
            <Separator />
            <CardContent>
                <DataTable
                    columns={columns}
                    data={rows}
                    emptyMessage="No sensors yet."
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
}: {
    initial: null | SensorRow;
    onClose: () => void;
    onSubmit: (v: SensorCreateInput) => void;
    pending: boolean;
}) {
    const form = useForm<SensorCreateInput>({
        defaultValues: {
            name: initial?.name ?? '',
            unit: initial?.unit ?? '',
        },
        resolver: zodResolver(sensorCreateSchema),
    });
    const submit = form.handleSubmit(onSubmit);
    const { errors } = form.formState;
    return (
        <DialogContent>
            <form onSubmit={submit}>
                <DialogHeader>
                    <DialogTitle>
                        {initial ? 'Edit sensor' : 'New sensor'}
                    </DialogTitle>
                </DialogHeader>
                <div className="mt-4 flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                        <Label>Name</Label>
                        <Input
                            placeholder="Temperature"
                            {...form.register('name')}
                        />
                        {errors.name && (
                            <p className="text-xs text-destructive">
                                {errors.name.message}
                            </p>
                        )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label>Unit</Label>
                        <Input placeholder="°C" {...form.register('unit')} />
                        {errors.unit && (
                            <p className="text-xs text-destructive">
                                {errors.unit.message}
                            </p>
                        )}
                    </div>
                </div>
                <DialogFooter className="mt-4">
                    <Button onClick={onClose} type="button" variant="ghost">
                        Cancel
                    </Button>
                    <Button disabled={pending} type="submit">
                        {initial ? 'Save' : 'Create'}
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
    );
}
