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
    type LocationCreateInput,
    locationCreateSchema,
    locationUpdateSchema,
} from '~/lib/schemas/sensor-hub';
import { api } from '~/trpc/react';

type EditLocationValues = {
    location_name: string;
    name: string;
};

type LocationRow = {
    created_at: Date;
    id: number;
    location_id: number;
    location_name: string;
    name: string;
};

export function LocationsPanel() {
    const utils = api.useUtils();
    const locs = api.location.listAdmin.useQuery();
    const create = api.location.create.useMutation({
        onError: (err) => toast.error(err.message),
        onSuccess: async () => {
            toast.success('Location created.');
            await utils.location.listAdmin.invalidate();
        },
    });
    const update = api.location.update.useMutation({
        onError: (err) => toast.error(err.message),
        onSuccess: async () => {
            toast.success('Location updated.');
            await utils.location.listAdmin.invalidate();
        },
    });
    const del = api.location.delete.useMutation({
        onError: (err) => toast.error(err.message),
        onSuccess: async () => {
            toast.success('Location deleted.');
            await utils.location.listAdmin.invalidate();
        },
    });

    const [newOpen, setNewOpen] = useState(false);
    const [editing, setEditing] = useState<LocationRow | null>(null);

    const rows = locs.data ?? [];

    const columns = useMemo<ColumnDef<LocationRow>[]>(
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
                accessorKey: 'location_id',
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground">
                        #{row.original.location_id}
                    </span>
                ),
                header: 'ID',
            },
            {
                accessorKey: 'location_name',
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground">
                        {row.original.location_name}
                    </span>
                ),
                header: 'Slug',
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
                                        Delete &ldquo;{row.original.name}
                                        &rdquo;?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Fails if devices or readings reference
                                        this location.
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
                <CardTitle>Locations</CardTitle>
                <Dialog onOpenChange={setNewOpen} open={newOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm">
                            <Plus className="mr-1 size-4" />
                            New location
                        </Button>
                    </DialogTrigger>
                    <NewLocationDialog
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
                    emptyMessage="No locations yet."
                    isLoading={locs.isLoading}
                    rowId={(r) => String(r.id)}
                    showFilter
                />
            </CardContent>

            <Dialog
                onOpenChange={(o) => !o && setEditing(null)}
                open={editing !== null}
            >
                {editing && (
                    <EditLocationDialog
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

function EditLocationDialog({
    initial,
    onClose,
    onSubmit,
    pending,
}: {
    initial: LocationRow;
    onClose: () => void;
    onSubmit: (v: EditLocationValues) => void;
    pending: boolean;
}) {
    const editSchema = locationUpdateSchema.omit({ id: true });
    const form = useForm<EditLocationValues>({
        defaultValues: {
            location_name: initial.location_name,
            name: initial.name,
        },
        resolver: zodResolver(editSchema),
    });
    const submit = form.handleSubmit(onSubmit);
    return (
        <DialogContent>
            <form onSubmit={submit}>
                <DialogHeader>
                    <DialogTitle>Edit location</DialogTitle>
                </DialogHeader>
                <div className="mt-4 flex flex-col gap-3">
                    <Field
                        error={form.formState.errors.name?.message}
                        label="Display name"
                    >
                        <Input {...form.register('name')} />
                    </Field>
                    <Field
                        error={form.formState.errors.location_name?.message}
                        label="Slug"
                    >
                        <Input {...form.register('location_name')} />
                    </Field>
                </div>
                <DialogFooter className="mt-4">
                    <Button onClick={onClose} type="button" variant="ghost">
                        Cancel
                    </Button>
                    <Button disabled={pending} type="submit">
                        Save
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
    );
}

function Field({
    children,
    error,
    label,
}: {
    children: React.ReactNode;
    error?: string;
    label: string;
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <Label>{label}</Label>
            {children}
            {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
    );
}

function NewLocationDialog({
    onClose,
    onSubmit,
    pending,
}: {
    onClose: () => void;
    onSubmit: (v: LocationCreateInput) => void;
    pending: boolean;
}) {
    const form = useForm<LocationCreateInput>({
        defaultValues: { location_id: 0, location_name: '', name: '' },
        resolver: zodResolver(locationCreateSchema),
    });
    const submit = form.handleSubmit(onSubmit);
    return (
        <DialogContent>
            <form onSubmit={submit}>
                <DialogHeader>
                    <DialogTitle>New location</DialogTitle>
                </DialogHeader>
                <div className="mt-4 flex flex-col gap-3">
                    <Field
                        error={form.formState.errors.name?.message}
                        label="Display name"
                    >
                        <Input
                            placeholder="Living room"
                            {...form.register('name')}
                        />
                    </Field>
                    <Field
                        error={form.formState.errors.location_name?.message}
                        label="Slug"
                    >
                        <Input
                            placeholder="living-room"
                            {...form.register('location_name')}
                        />
                    </Field>
                    <Field
                        error={form.formState.errors.location_id?.message}
                        label="Public location ID"
                    >
                        <Input
                            inputMode="numeric"
                            {...form.register('location_id', {
                                valueAsNumber: true,
                            })}
                        />
                    </Field>
                </div>
                <DialogFooter className="mt-4">
                    <Button onClick={onClose} type="button" variant="ghost">
                        Cancel
                    </Button>
                    <Button disabled={pending} type="submit">
                        Create
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
    );
}
