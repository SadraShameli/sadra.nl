'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { MapPin, Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { ProfileFormDialog } from '~/app/(app)/profile/_components/ProfileFormDialog';
import {
    ProfileNumberField,
    ProfileTextField,
} from '~/app/(app)/profile/_components/ProfileFormFields';
import { ProfilePanel } from '~/app/(app)/profile/_components/ProfilePanel';
import {
    MutedCell,
    PrimaryCell,
    profileActionsColumn,
    ProfileDateCell,
    ProfileDatePrecision,
    ProfileTableEmpty,
    RowActionButton,
    RowConfirmAction,
} from '~/app/(app)/profile/_components/ProfileTable';
import { Button } from '~/components/ui/Button';
import {
    DataTable,
    type DataTableColumn,
    hasActiveTableFilter,
} from '~/components/ui/DataTable';
import { Dialog, DialogTrigger } from '~/components/ui/Dialog';
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

const editLocationSchema = locationUpdateSchema.omit({ id: true });

export function LocationsPanel() {
    const utilities = api.useUtils();
    const locs = api.location.listAdmin.useQuery();
    const create = api.location.create.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Location created.');
            await utilities.location.listAdmin.invalidate();
        },
    });
    const update = api.location.update.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Location updated.');
            await utilities.location.listAdmin.invalidate();
        },
    });
    const del = api.location.delete.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Location deleted.');
            await utilities.location.listAdmin.invalidate();
        },
    });

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
            profileActionsColumn<LocationRow>((location) => (
                <>
                    <RowActionButton
                        icon={Pencil}
                        label="Edit location"
                        onClick={() => setEditing(location)}
                    />
                    <RowConfirmAction
                        description="Fails if devices or readings reference this location."
                        label="Delete location"
                        onConfirm={() => del.mutate({ id: location.id })}
                        title={`Delete “${location.name}”?`}
                    />
                </>
            )),
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
                <ProfilePanel
                    action={newButton}
                    description="Places where devices capture readings and recordings."
                    title="Locations"
                >
                    <DataTable
                        columns={columns}
                        data={rows}
                        emptyState={(table) => (
                            <ProfileTableEmpty
                                action={newButton}
                                description="Add a location to group readings by where they were captured."
                                filtered={hasActiveTableFilter(table)}
                                icon={MapPin}
                                noun="locations"
                            />
                        )}
                        filterPlaceholder="Search locations…"
                        isLoading={locs.isLoading}
                        rowId={(r) => String(r.id)}
                        showFilter
                    />
                </ProfilePanel>
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
        <ProfileFormDialog
            form={form}
            onCancel={onClose}
            onSubmit={onSubmit}
            pending={pending}
            submitLabel="Save"
            title="Edit location"
        >
            <ProfileTextField
                control={form.control}
                label="Display name"
                name="name"
            />
            <ProfileTextField
                control={form.control}
                label="Slug"
                name="location_name"
            />
        </ProfileFormDialog>
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
        <ProfileFormDialog
            form={form}
            onCancel={onClose}
            onSubmit={onSubmit}
            pending={pending}
            submitLabel="Create"
            title="New location"
        >
            <ProfileTextField
                control={form.control}
                label="Display name"
                name="name"
                placeholder="Living room"
            />
            <ProfileTextField
                control={form.control}
                label="Slug"
                name="location_name"
                placeholder="living-room"
            />
            <ProfileNumberField
                control={form.control}
                label="Public location ID"
                name="location_id"
            />
        </ProfileFormDialog>
    );
}
