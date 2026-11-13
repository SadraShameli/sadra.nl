'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { MapPin, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import {
    MutedCell,
    PrimaryCell,
    ProfileCollectionEmpty,
    ProfileDateCell,
    ProfileDatePrecision,
} from '~/app/(app)/profile/_components/ProfileTable';
import { FormDialog } from '~/components/FormDialog';
import { FormNumberField, FormTextField } from '~/components/FormFields';
import {
    deleteRowAction,
    editRowAction,
    rowActionsColumn,
} from '~/components/RowActionsMenu';
import { ToolPanel } from '~/components/ToolPanel';
import { Button } from '~/components/ui/button';
import { DataTable, type DataTableColumn } from '~/components/ui/data-table';
import { Dialog, DialogTrigger } from '~/components/ui/dialog';
import { NoMatchesState } from '~/components/ui/empty-state';
import {
    type LocationCreateInput,
    locationCreateSchema,
    locationUpdateSchema,
} from '~/lib/schemas/sensor-hub';
import { useTRPC } from '~/trpc/react';

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

const editLocationSchema = locationUpdateSchema.omit({ id: true });

export function LocationsPanel() {
    const api = useTRPC();
    const queryClient = useQueryClient();
    const locs = useQuery(api.location.listAdmin.queryOptions());
    const create = useMutation(
        api.location.create.mutationOptions({
            onError: (error) => toast.error(error.message),
            onSuccess: async () => {
                toast.success('Location created.');
                await queryClient.invalidateQueries(
                    api.location.listAdmin.pathFilter(),
                );
            },
        }),
    );
    const update = useMutation(
        api.location.update.mutationOptions({
            onError: (error) => toast.error(error.message),
            onSuccess: async () => {
                toast.success('Location updated.');
                await queryClient.invalidateQueries(
                    api.location.listAdmin.pathFilter(),
                );
            },
        }),
    );
    const del = useMutation(
        api.location.delete.mutationOptions({
            onError: (error) => toast.error(error.message),
            onSuccess: async () => {
                toast.success('Location deleted.');
                await queryClient.invalidateQueries(
                    api.location.listAdmin.pathFilter(),
                );
            },
        }),
    );

    const [newOpen, setNewOpen] = useState(false);
    const [editing, setEditing] = useState<LocationRow | null>(null);

    const rows = useMemo(() => locs.data ?? [], [locs.data]);

    const columns = useMemo<DataTableColumn<LocationRow>[]>(
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
                accessorKey: 'location_id',
                cell: ({ row }) => (
                    <MutedCell>#{row.original.location_id}</MutedCell>
                ),
                header: 'ID',
            },
            {
                accessorKey: 'location_name',
                cell: ({ row }) => (
                    <MutedCell>{row.original.location_name}</MutedCell>
                ),
                header: 'Slug',
            },
            {
                accessorKey: 'created_at',
                cell: ({ row }) => (
                    <ProfileDateCell
                        precision={ProfileDatePrecision.Day}
                        value={row.original.created_at}
                    />
                ),
                header: 'Created',
            },
            rowActionsColumn<LocationRow>({
                actionsOf: (location) => [
                    editRowAction(() => setEditing(location)),
                    deleteRowAction({
                        description:
                            'Fails if devices or readings reference this location.',
                        onDelete: () => del.mutate({ id: location.id }),
                        title: `Delete “${location.name}”?`,
                    }),
                ],
                isPendingOf: (location) =>
                    del.isPending && del.variables.id === location.id,
                labelOf: (location) => location.name,
            }),
        ],
        [del],
    );

    const newButton = (
        <DialogTrigger asChild>
            <Button size="sm">
                <Plus className="size-4" />
                New location
            </Button>
        </DialogTrigger>
    );

    return (
        <>
            <Dialog onOpenChange={setNewOpen} open={newOpen}>
                <ToolPanel
                    actions={newButton}
                    description="Places where devices capture readings and recordings."
                    title="Locations"
                >
                    {!locs.isLoading && rows.length === 0 ? (
                        <ProfileCollectionEmpty
                            description="Add a location to group readings by where they were captured."
                            icon={MapPin}
                            noun="locations"
                        />
                    ) : (
                        <DataTable
                            columns={columns}
                            data={rows}
                            emptyState={
                                <NoMatchesState
                                    icon={MapPin}
                                    noun="locations"
                                />
                            }
                            filterPlaceholder="Search locations…"
                            isLoading={locs.isLoading}
                            rowId={(r) => String(r.id)}
                            showFilter
                        />
                    )}
                </ToolPanel>
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
        </>
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
    const form = useForm<EditLocationValues>({
        defaultValues: {
            location_name: initial.location_name,
            name: initial.name,
        },
        resolver: zodResolver(editLocationSchema),
    });
    return (
        <FormDialog
            form={form}
            onCancel={onClose}
            onSubmit={onSubmit}
            pending={pending}
            submitLabel="Save"
            title="Edit location"
        >
            <FormTextField
                control={form.control}
                label="Display name"
                name="name"
            />
            <FormTextField
                control={form.control}
                label="Slug"
                name="location_name"
            />
        </FormDialog>
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
    return (
        <FormDialog
            form={form}
            onCancel={onClose}
            onSubmit={onSubmit}
            pending={pending}
            submitLabel="Create"
            title="New location"
        >
            <FormTextField
                control={form.control}
                label="Display name"
                name="name"
                placeholder="Living room"
            />
            <FormTextField
                control={form.control}
                label="Slug"
                name="location_name"
                placeholder="living-room"
            />
            <FormNumberField
                control={form.control}
                isInteger
                label="Public location ID"
                name="location_id"
            />
        </FormDialog>
    );
}
