'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type ColumnDef } from '@tanstack/react-table';
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
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
import { ClearFiltersButton } from '~/components/ui/ClearFiltersButton';
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
import { Label } from '~/components/ui/Label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
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

const ALL = '__all__';

export function LocationsPanel() {
    const utilities = api.useUtils();
    const locs = api.location.listAdmin.useQuery();
    const devices = api.device.listAdmin.useQuery();
    const sensors = api.sensor.listAdmin.useQuery();
    const deviceSensorMappings = api.sensor.listDeviceMappings.useQuery();
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
    const [developmentFilter, setDevelopmentFilter] = useState<string>(ALL);
    const [locFilter, setLocFilter] = useState<string>(ALL);
    const [sensFilter, setSensFilter] = useState<string>(ALL);
    const hasFilters =
        locFilter !== ALL || developmentFilter !== ALL || sensFilter !== ALL;
    const resetFilters = () => {
        setLocFilter(ALL);
        setDevelopmentFilter(ALL);
        setSensFilter(ALL);
    };

    const allRows = useMemo(() => locs.data ?? [], [locs.data]);
    const developmentOptions = useMemo(
        () => devices.data ?? [],
        [devices.data],
    );
    const sensorOptions = useMemo(() => sensors.data ?? [], [sensors.data]);
    const locationIdsWithSensor = useMemo(() => {
        if (sensFilter === ALL) return null;
        const sensorId = Number(sensFilter);
        const deviceIds = new Set(
            (deviceSensorMappings.data ?? [])
                .filter((m) => m.sensor_id === sensorId)
                .map((m) => m.device_id),
        );
        return new Set(
            developmentOptions
                .filter((d) => deviceIds.has(d.id))
                .map((d) => d.location_id),
        );
    }, [deviceSensorMappings.data, developmentOptions, sensFilter]);
    const rows = useMemo(() => {
        return allRows.filter((l) => {
            if (locFilter !== ALL && String(l.id) !== locFilter) return false;
            if (developmentFilter !== ALL) {
                const development = developmentOptions.find(
                    (d) => String(d.id) === developmentFilter,
                );
                if (l.id !== development?.location_id) return false;
            }
            return !locationIdsWithSensor || locationIdsWithSensor.has(l.id);
        });
    }, [
        allRows,
        developmentOptions,
        developmentFilter,
        locFilter,
        locationIdsWithSensor,
    ]);

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
            <CardContent className="flex flex-col gap-3">
                <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <FilterField
                        label="Location"
                        onChange={setLocFilter}
                        options={allRows.map((l) => ({
                            id: String(l.id),
                            name: l.name,
                        }))}
                        value={locFilter}
                    />
                    <FilterField
                        label="Device"
                        onChange={setDevelopmentFilter}
                        options={developmentOptions.map((d) => ({
                            id: String(d.id),
                            name: d.name,
                        }))}
                        value={developmentFilter}
                    />
                    <FilterField
                        label="Sensor"
                        onChange={setSensFilter}
                        options={sensorOptions.map((s) => ({
                            id: String(s.id),
                            name: s.name,
                        }))}
                        value={sensFilter}
                    />
                </div>

                <DataTable
                    columns={columns}
                    data={rows}
                    emptyState={
                        <EmptyState
                            description="Add a location to group readings by where they were captured."
                            icon={MapPin}
                            title="No locations yet"
                        />
                    }
                    headerActions={
                        <ClearFiltersButton
                            active={hasFilters}
                            onReset={resetFilters}
                        />
                    }
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
    return (
        <DialogContent>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                    <DialogHeader>
                        <DialogTitle>Edit location</DialogTitle>
                    </DialogHeader>
                    <div className="mt-4 flex flex-col gap-3">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Display name</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="location_name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Slug</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
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
            </Form>
        </DialogContent>
    );
}

function FilterField({
    label,
    onChange,
    options,
    value,
}: {
    label: string;
    onChange: (v: string) => void;
    options: { id: string; name: string }[];
    value: string;
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{label}</Label>
            <Select onValueChange={onChange} value={value}>
                <SelectTrigger>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={ALL}>All</SelectItem>
                    {options.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                            {o.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
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
    return (
        <DialogContent>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                    <DialogHeader>
                        <DialogTitle>New location</DialogTitle>
                    </DialogHeader>
                    <div className="mt-4 flex flex-col gap-3">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Display name</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="Living room"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="location_name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Slug</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="living-room"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="location_id"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Public location ID</FormLabel>
                                    <FormControl>
                                        <Input
                                            inputMode="numeric"
                                            onChange={(event) => {
                                                const n = Number(
                                                    event.target.value,
                                                );
                                                field.onChange(
                                                    Number.isFinite(n) ? n : 0,
                                                );
                                            }}
                                            ref={field.ref}
                                            step="1"
                                            type="number"
                                            value={field.value}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
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
            </Form>
        </DialogContent>
    );
}
