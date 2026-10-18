'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Plus, Radio, Ruler } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import {
    MutedCell,
    PrimaryCell,
    ProfileCollectionEmpty,
    ProfileDateCell,
    ProfileDatePrecision,
} from '~/app/(app)/profile/_components/ProfileTable';
import { FormDialog } from '~/components/FormDialog';
import { FormTextField } from '~/components/FormFields';
import {
    deleteRowAction,
    editRowAction,
    RowActionKind,
    rowActionsColumn,
    RowActionsMenu,
} from '~/components/RowActionsMenu';
import { ToolPanel } from '~/components/ToolPanel';
import { Button } from '~/components/ui/button';
import { DataTable, type DataTableColumn } from '~/components/ui/data-table';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '~/components/ui/dialog';
import { EmptyState, EmptyStateSize, NoMatchesState } from '~/components/ui/empty-state';
import { Field, FieldError, FieldLabel } from '~/components/ui/field';
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
                meta: { isRowHeader: true },
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
            rowActionsColumn<SensorRow>({
                actionsOf: (sensor) => [
                    editRowAction(() => setEditing(sensor)),
                    deleteRowAction({
                        description:
                            'Removes its device mappings. Fails if readings reference it.',
                        onDelete: () => del.mutate({ id: sensor.id }),
                        title: `Delete sensor “${sensor.name}”?`,
                    }),
                ],
                isPendingOf: (sensor) =>
                    del.isPending && del.variables.id === sensor.id,
                labelOf: (sensor) => sensor.name,
            }),
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
                <ToolPanel
                    actions={
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
                    {!sensors.isLoading &&
                    !scope.isActive &&
                    rows.length === 0 ? (
                        <ProfileCollectionEmpty
                            description="Add a sensor to track readings from your devices."
                            icon={Radio}
                            noun="sensors"
                        />
                    ) : (
                        <DataTable
                            columns={columns}
                            data={rows}
                            emptyState={
                                <NoMatchesState
                                    icon={Radio}
                                    noun="sensors"
                                />
                            }
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
                    )}
                </ToolPanel>
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

function RenameUnitDialog({
    onClose,
    onSubmit,
    pending,
    unit,
}: {
    onClose: () => void;
    onSubmit: (values: SensorUnitUpdateInput) => void;
    pending: boolean;
    unit: UnitRow;
}) {
    const form = useForm<SensorUnitUpdateInput>({
        defaultValues: { id: unit.id, value: unit.value },
        resolver: zodResolver(sensorUnitUpdateSchema),
    });
    return (
        <FormDialog
            form={form}
            onCancel={onClose}
            onSubmit={onSubmit}
            pending={pending}
            submitLabel="Save"
            title="Rename unit"
        >
            <FormTextField control={form.control} label="Unit" name="value" />
        </FormDialog>
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
    const formId = useId();
    return (
        <FormDialog
            form={form}
            onCancel={onClose}
            onSubmit={onSubmit}
            pending={pending}
            submitDisabled={units.length === 0}
            submitLabel={initial ? 'Save' : 'Create'}
            title={initial ? 'Edit sensor' : 'New sensor'}
        >
            <FormTextField
                control={form.control}
                label="Name"
                name="name"
                placeholder="Temperature"
            />
            <Controller
                control={form.control}
                name="unit"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-unit`}>Unit</FieldLabel>
                        <Select
                            onValueChange={field.onChange}
                            value={field.value}
                        >
                            <SelectTrigger
                                aria-invalid={fieldState.invalid}
                                id={`${formId}-unit`}
                            >
                                <SelectValue placeholder="Pick a unit">
                                    {
                                        units.find(
                                            (u) => u.value === field.value,
                                        )?.value
                                    }
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                {units.map((u) => (
                                    <SelectItem key={u.id} value={u.value}>
                                        {u.value}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
        </FormDialog>
    );
}

function UnitsManagerDialog({
    onClose,
    units,
}: {
    onClose: () => void;
    units: UnitRow[];
}) {
    const formId = useId();
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
    const rename = api.sensorUnit.update.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Unit renamed.');
            await invalidate();
        },
    });
    const [renaming, setRenaming] = useState<null | UnitRow>(null);
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
            <form className="mt-2 flex flex-col gap-3" onSubmit={onAdd}>
                <Controller
                    control={unitCreateForm.control}
                    name="value"
                    render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor={`${formId}-value`}>
                                New unit
                            </FieldLabel>
                            <div className="flex gap-2">
                                <Input
                                    aria-invalid={fieldState.invalid}
                                    id={`${formId}-value`}
                                    placeholder="e.g. lux"
                                    {...field}
                                />
                                <Button
                                    disabled={create.isPending}
                                    type="submit"
                                >
                                    <Plus className="size-4" />
                                    Add
                                </Button>
                            </div>
                            <FieldError errors={[fieldState.error]} />
                        </Field>
                    )}
                />
            </form>

            <Separator className="my-2" />

            <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
                {units.length === 0 && (
                    <EmptyState
                        description="Add a unit above to use it on sensors."
                        icon={Ruler}
                        size={EmptyStateSize.Compact}
                        title="No units yet"
                    />
                )}
                {units.map((u) => (
                    <div
                        className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-3 py-2"
                        key={u.id}
                    >
                        <span className="font-mono text-sm text-foreground">
                            {u.value}
                        </span>
                        <RowActionsMenu
                            actions={[
                                {
                                    icon: Pencil,
                                    kind: RowActionKind.Select,
                                    label: 'Rename',
                                    onSelect: () => setRenaming(u),
                                },
                                deleteRowAction({
                                    description:
                                        'Fails if any sensor still uses this unit.',
                                    onDelete: () => del.mutate({ id: u.id }),
                                    title: `Delete unit “${u.value}”?`,
                                }),
                            ]}
                            isPending={
                                del.isPending && del.variables.id === u.id
                            }
                            label={u.value}
                        />
                    </div>
                ))}
            </div>

            <Dialog
                onOpenChange={(o) => !o && setRenaming(null)}
                open={renaming !== null}
            >
                {renaming && (
                    <RenameUnitDialog
                        onClose={() => setRenaming(null)}
                        onSubmit={(values) =>
                            rename.mutate(values, {
                                onSuccess: () => setRenaming(null),
                            })
                        }
                        pending={rename.isPending}
                        unit={renaming}
                    />
                )}
            </Dialog>

            <DialogFooter className="mt-2">
                <Button onClick={onClose} type="button" variant="ghost">
                    Close
                </Button>
            </DialogFooter>
        </DialogContent>
    );
}
