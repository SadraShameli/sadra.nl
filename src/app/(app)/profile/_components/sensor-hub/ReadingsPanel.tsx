'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Activity, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { idSelectKey } from '~/app/(app)/profile/_components/idSelectKey';
import {
    formatProfileDate,
    MutedCell,
    PrimaryCell,
    ProfileCollectionEmpty,
    ProfileDateCell,
    ProfileDatePrecision,
} from '~/app/(app)/profile/_components/ProfileTable';
import { FormDialog } from '~/components/FormDialog';
import {
    FormNumberField,
    FormSelectField,
    type FormSelectOption,
} from '~/components/FormFields';
import { deleteRowAction, rowActionsColumn } from '~/components/RowActionsMenu';
import { ToolPanel } from '~/components/ToolPanel';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { DataTable, type DataTableColumn } from '~/components/ui/data-table';
import { Dialog, DialogTrigger } from '~/components/ui/dialog';
import { NoMatchesState } from '~/components/ui/empty-state';
import {
    type ReadingCreateAdminInput,
    readingCreateAdminSchema,
} from '~/lib/schemas/sensor-hub';
import { api } from '~/trpc/react';

import { SensorHubScopeFilters, useSensorHubScope } from './SensorHubScope';

type ReadingRow = {
    created_at: Date;
    device_id: number;
    id: number;
    location_id: number;
    sensor_id: number;
    value: number;
};

type SensorOption = { id: number; name: string; unit: null | string };

export function ReadingsPanel() {
    const utilities = api.useUtils();
    const locations = api.location.listAdmin.useQuery();
    const devices = api.device.listAdmin.useQuery();
    const sensors = api.sensor.listAdmin.useQuery();

    const scope = useSensorHubScope();
    const [selected, setSelected] = useState<ReadingRow[]>([]);

    const readings = api.reading.listAdmin.useQuery({
        device_id: scope.scope.deviceId,
        limit: 500,
        location_id: scope.scope.locationId,
        sensor_id: scope.scope.sensorId,
    });

    const del = api.reading.delete.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Reading deleted.');
            await utilities.reading.listAdmin.invalidate();
        },
    });
    const delBulk = api.reading.deleteBulk.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async (r) => {
            toast.success(`Deleted ${r.deleted} reading(s).`);
            setSelected([]);
            await utilities.reading.listAdmin.invalidate();
        },
    });
    const readingCreateMutation = api.reading.createAdmin.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Reading created.');
            await utilities.reading.listAdmin.invalidate();
        },
    });
    const [newOpen, setNewOpen] = useState(false);

    const rows = readings.data ?? [];
    const sensorMap = useMemo(
        () => new Map(sensors.data?.map((s) => [s.id, s])),
        [sensors.data],
    );
    const deviceMap = useMemo(
        () => new Map(devices.data?.map((d) => [d.id, d.name])),
        [devices.data],
    );

    const columns = useMemo<DataTableColumn<ReadingRow>[]>(() => {
        const valueWithUnit = (reading: ReadingRow): string => {
            const unit = sensorMap.get(reading.sensor_id)?.unit;
            return unit
                ? `${String(reading.value)} ${unit}`
                : String(reading.value);
        };
        const describeReading = (reading: ReadingRow): string =>
            `${valueWithUnit(reading)} at ${formatProfileDate(reading.created_at, ProfileDatePrecision.Minute)}`;
        return [
            {
                cell: ({ row }) => (
                    <Checkbox
                        aria-label="Select row"
                        checked={row.getIsSelected()}
                        onCheckedChange={(v) => row.toggleSelected(!!v)}
                    />
                ),
                enableSorting: false,
                header: ({ table }) => (
                    <Checkbox
                        aria-label="Select all rows on this page"
                        checked={
                            table.getIsAllPageRowsSelected() ||
                            (table.getIsSomePageRowsSelected() &&
                                'indeterminate')
                        }
                        onCheckedChange={(v) =>
                            table.toggleAllPageRowsSelected(!!v)
                        }
                    />
                ),
                id: 'select',
            },
            {
                accessorKey: 'value',
                cell: ({ row }) => (
                    <PrimaryCell>{valueWithUnit(row.original)}</PrimaryCell>
                ),
                header: 'Value',
                meta: { isRowHeader: true },
            },
            {
                accessorFn: (row) =>
                    sensorMap.get(row.sensor_id)?.name ??
                    `sensor#${row.sensor_id}`,
                cell: ({ getValue }) => (
                    <MutedCell>{String(getValue())}</MutedCell>
                ),
                header: 'Sensor',
                id: 'sensor',
            },
            {
                accessorFn: (row) =>
                    deviceMap.get(row.device_id) ?? `device#${row.device_id}`,
                cell: ({ getValue }) => (
                    <MutedCell>{String(getValue())}</MutedCell>
                ),
                header: 'Device',
                id: 'device',
            },
            {
                accessorKey: 'created_at',
                cell: ({ row }) => (
                    <ProfileDateCell
                        precision={ProfileDatePrecision.Minute}
                        value={row.original.created_at}
                    />
                ),
                header: 'Recorded',
            },
            rowActionsColumn<ReadingRow>({
                actionsOf: (reading) => [
                    deleteRowAction({
                        description: `${describeReading(reading)}.`,
                        onDelete: () => del.mutate({ id: reading.id }),
                        title: 'Delete reading?',
                    }),
                ],
                isPendingOf: (reading) =>
                    del.isPending && del.variables.id === reading.id,
                labelOf: describeReading,
            }),
        ];
    }, [del, deviceMap, sensorMap]);

    const newButton = (
        <DialogTrigger asChild>
            <Button size="sm">
                <Plus className="size-4" />
                New reading
            </Button>
        </DialogTrigger>
    );

    return (
        <Dialog onOpenChange={setNewOpen} open={newOpen}>
            <ToolPanel
                actions={
                    <>
                        {selected.length > 0 && (
                            <ConfirmDialog
                                confirmLabel="Delete"
                                description="This cannot be undone."
                                onConfirm={() =>
                                    delBulk.mutate({
                                        ids: selected.map((r) => r.id),
                                    })
                                }
                                title={
                                    <>Delete {selected.length} reading(s)?</>
                                }
                            >
                                <Button size="sm" variant="destructive">
                                    <Trash2 className="size-4" />
                                    Delete {selected.length}
                                </Button>
                            </ConfirmDialog>
                        )}
                        {newButton}
                    </>
                }
                description="Raw sensor values, newest first. Select rows to delete them in bulk."
                title="Readings"
            >
                {!readings.isLoading && !scope.isActive && rows.length === 0 ? (
                    <ProfileCollectionEmpty
                        description="Readings appear here as devices report them."
                        icon={Activity}
                        noun="readings"
                    />
                ) : (
                    <DataTable
                        columns={columns}
                        data={rows}
                        emptyState={
                            <NoMatchesState icon={Activity} noun="readings" />
                        }
                        filterPlaceholder="Search readings…"
                        hasExternalFilters={scope.isActive}
                        headerActions={
                            <SensorHubScopeFilters
                                controller={scope}
                                devices={devices.data ?? []}
                                locations={locations.data ?? []}
                                sensors={sensors.data ?? []}
                            />
                        }
                        isLoading={readings.isLoading}
                        onResetFilters={scope.reset}
                        onRowSelectionChange={setSelected}
                        rowId={(r) => String(r.id)}
                        rowSelection
                        showFilter
                    />
                )}
            </ToolPanel>
            <NewReadingDialog
                devices={(devices.data ?? []).map((d) => ({
                    label: d.name,
                    value: d.id,
                }))}
                onClose={() => setNewOpen(false)}
                onSubmit={(v) =>
                    readingCreateMutation.mutate(v, {
                        onSuccess: () => setNewOpen(false),
                    })
                }
                pending={readingCreateMutation.isPending}
                sensors={(sensors.data ?? []).map((s) => ({
                    id: s.id,
                    name: s.name,
                    unit: s.unit,
                }))}
            />
        </Dialog>
    );
}

function NewReadingDialog({
    devices,
    onClose,
    onSubmit,
    pending,
    sensors,
}: {
    devices: FormSelectOption<number>[];
    onClose: () => void;
    onSubmit: (v: ReadingCreateAdminInput) => void;
    pending: boolean;
    sensors: SensorOption[];
}) {
    const form = useForm<ReadingCreateAdminInput>({
        defaultValues: { deviceId: 0, sensorId: 0, value: 0 },
        resolver: zodResolver(readingCreateAdminSchema),
    });
    const sensorId = useWatch({ control: form.control, name: 'sensorId' });
    const selectedUnit = sensors.find((s) => s.id === sensorId)?.unit;
    return (
        <FormDialog
            form={form}
            onCancel={onClose}
            onSubmit={onSubmit}
            pending={pending}
            submitLabel="Create"
            title="New reading"
        >
            <FormSelectField
                control={form.control}
                keyOf={idSelectKey}
                label="Device"
                name="deviceId"
                options={devices}
                placeholder="Pick a device"
            />
            <FormSelectField
                control={form.control}
                keyOf={idSelectKey}
                label="Sensor"
                name="sensorId"
                options={sensors.map((s) => ({
                    label: s.unit ? `${s.name} (${s.unit})` : s.name,
                    value: s.id,
                }))}
                placeholder="Pick a sensor"
            />
            <FormNumberField
                control={form.control}
                label={selectedUnit ? `Value (${selectedUnit})` : 'Value'}
                name="value"
            />
        </FormDialog>
    );
}
