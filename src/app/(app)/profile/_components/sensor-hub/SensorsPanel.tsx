'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Pencil, Plus, Radio, Ruler, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { ProfileFormDialog } from '~/app/(app)/profile/_components/ProfileFormDialog';
import { ProfileTextField } from '~/app/(app)/profile/_components/ProfileFormFields';
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
import { Button } from '~/components/ui/button';
import {
    DataTable,
    type DataTableColumn,
    hasActiveTableFilter,
} from '~/components/ui/data-table';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '~/components/ui/dialog';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '~/components/ui/form';
import { Input } from '~/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/select';
import { Separator } from '~/components/ui/separator';
import {
    type SensorCreateInput,
    sensorCreateSchema,
    type SensorUnitCreateInput,
    sensorUnitCreateSchema,
    type SensorUnitUpdateInput,
    sensorUnitUpdateSchema,
} from '~/lib/schemas/sensor-hub';
import { api } from '~/trpc/react';

import { SensorHubScopeFilters, useSensorHubScope } from './SensorHubScope';

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
    const locations = api.location.listAdmin.useQuery();
    const devices = api.device.listAdmin.useQuery();
    const mappings = api.sensor.listDeviceMappings.useQuery();
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
    const scope = useSensorHubScope();
    const { deviceId, locationId } = scope.scope;

    const unitOptions = units.data ?? [];
    const deviceRows = useMemo(() => devices.data ?? [], [devices.data]);

    const sensorLinks = useMemo(() => {
        const locationOfDevice = new Map(
            deviceRows.map((device) => [device.id, device.location_id]),
        );
        return (mappings.data ?? []).map((mapping) => ({
            deviceId: mapping.device_id,
            locationId: locationOfDevice.get(mapping.device_id),
            sensorId: mapping.sensor_id,
        }));
    }, [deviceRows, mappings.data]);

    const counts = useMemo(() => {
        const sensorsByLocation = new Map<number, Set<number>>();
        const device = new Map<number, number>();
        for (const link of sensorLinks) {
            device.set(link.deviceId, (device.get(link.deviceId) ?? 0) + 1);
            if (link.locationId === undefined) continue;
            const set = sensorsByLocation.get(link.locationId) ?? new Set();
            set.add(link.sensorId);
            sensorsByLocation.set(link.locationId, set);
        }
        const location = new Map(
            [...sensorsByLocation].map(([id, set]) => [id, set.size]),
        );
        return { device, location };
    }, [sensorLinks]);

    const rows = useMemo(() => {
        const all = sensors.data ?? [];
        if (deviceId === undefined && locationId === undefined) return all;
        const inScope = new Set(
            sensorLinks
                .filter(
                    (link) =>
                        (deviceId === undefined ||
                            link.deviceId === deviceId) &&
                        (locationId === undefined ||
                            link.locationId === locationId),
                )
                .map((link) => link.sensorId),
        );
        return all.filter((sensor) => inScope.has(sensor.id));
    }, [deviceId, locationId, sensorLinks, sensors.data]);

    const columns = useMemo<DataTableColumn<SensorRow>[]>(
        () => [
            {
                accessorKey: 'name',
                cell: ({ row }) => (
                    <PrimaryCell>{row.original.name}</PrimaryCell>
                ),
                header: 'Name',
            },
            {
                accessorKey: 'unit',
                cell: ({ row }) => <MutedCell>{row.original.unit}</MutedCell>,
                header: 'Unit',
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
            profileActionsColumn<SensorRow>((sensor) => (
                <>
                    <RowActionButton
                        icon={Pencil}
                        label="Edit sensor"
                        onClick={() => setEditing(sensor)}
                    />
                    <RowConfirmAction
                        description="Removes its device mappings. Fails if readings reference it."
                        label="Delete sensor"
                        onConfirm={() => del.mutate({ id: sensor.id })}
                        title={`Delete sensor “${sensor.name}”?`}
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
                New sensor
            </Button>
        </DialogTrigger>
    );

    return (
        <>
            <Dialog onOpenChange={setNewOpen} open={newOpen}>
                <ProfilePanel
                    action={
                        <>
                            <Button
                                onClick={() => setUnitsOpen(true)}
                                size="sm"
                                variant="outline"
                            >
                                <Ruler className="size-4" />
                                Manage units
                            </Button>
                            {newButton}
                        </>
                    }
                    description="What each device measures, and the units readings use."
                    title="Sensors"
                >
                    <DataTable
                        columns={columns}
                        data={rows}
                        emptyState={(table) => (
                            <ProfileTableEmpty
                                action={newButton}
                                description="Add a sensor to track readings from your devices."
                                filtered={
                                    scope.isActive ||
                                    hasActiveTableFilter(table)
                                }
                                icon={Radio}
                                noun="sensors"
                            />
                        )}
                        filterPlaceholder="Search sensors…"
                        hasExternalFilters={scope.isActive}
                        headerActions={
                            <SensorHubScopeFilters
                                controller={scope}
                                counts={counts}
                                devices={deviceRows}
                                locations={locations.data ?? []}
                            />
                        }
                        isLoading={sensors.isLoading}
                        onResetFilters={scope.reset}
                        rowId={(r) => String(r.id)}
                        showFilter
                    />
                </ProfilePanel>
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

            <Dialog onOpenChange={setUnitsOpen} open={unitsOpen}>
                <UnitsManagerDialog
                    onClose={() => setUnitsOpen(false)}
                    units={unitOptions}
                />
            </Dialog>

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
        </>
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
        <ProfileFormDialog
            form={form}
            onCancel={onClose}
            onSubmit={onSubmit}
            pending={pending}
            submitDisabled={units.length === 0}
            submitLabel={initial ? 'Save' : 'Create'}
            title={initial ? 'Edit sensor' : 'New sensor'}
        >
            <ProfileTextField
                control={form.control}
                label="Name"
                name="name"
                placeholder="Temperature"
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
                                    <SelectItem key={u.id} value={u.value}>
                                        {u.value}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )}
            />
        </ProfileFormDialog>
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
                <span className="font-mono text-sm text-foreground">
                    {unit.value}
                </span>
                <div className="flex items-center gap-1">
                    <RowActionButton
                        icon={Pencil}
                        label="Rename unit"
                        onClick={() => setEditing(true)}
                    />
                    <RowConfirmAction
                        description="Fails if any sensor still uses this unit."
                        label="Delete unit"
                        onConfirm={onDelete}
                        title={`Delete unit “${unit.value}”?`}
                    />
                </div>
            </div>
        );
    }

    const onSubmit = form.handleSubmit((values) => update.mutate(values));

    return (
        <Form {...form}>
            <form
                className="flex items-center gap-2 rounded-md border border-border/60 bg-background p-2"
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
                    aria-label="Save unit"
                    disabled={update.isPending}
                    size="icon-sm"
                    title="Save unit"
                    type="submit"
                    variant="ghost"
                >
                    <Check className="size-4" />
                </Button>
                <Button
                    aria-label="Cancel rename"
                    onClick={() => {
                        form.reset({ id: unit.id, value: unit.value });
                        setEditing(false);
                    }}
                    size="icon-sm"
                    title="Cancel rename"
                    type="button"
                    variant="ghost"
                >
                    <X className="size-4" />
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
                                        <Plus className="size-4" />
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
