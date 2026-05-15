'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
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
import { Checkbox } from '~/components/ui/Checkbox';
import { DataTable } from '~/components/ui/DataTable';
import { Label } from '~/components/ui/Label';
import { Select } from '~/components/ui/Select';
import { Separator } from '~/components/ui/Separator';
import { api } from '~/trpc/react';

const ALL = '__all__';

type ReadingRow = {
    created_at: Date;
    device_id: number;
    id: number;
    location_id: number;
    sensor_id: number;
    value: number;
};

export function ReadingsPanel() {
    const utils = api.useUtils();
    const locations = api.location.listAdmin.useQuery();
    const devices = api.device.listAdmin.useQuery();
    const sensors = api.sensor.listAdmin.useQuery();

    const [locFilter, setLocFilter] = useState(ALL);
    const [devFilter, setDevFilter] = useState(ALL);
    const [sensFilter, setSensFilter] = useState(ALL);
    const [selected, setSelected] = useState<ReadingRow[]>([]);

    const readings = api.reading.listAdmin.useQuery({
        device_id: devFilter === ALL ? undefined : Number(devFilter),
        limit: 500,
        location_id: locFilter === ALL ? undefined : Number(locFilter),
        sensor_id: sensFilter === ALL ? undefined : Number(sensFilter),
    });

    const del = api.reading.delete.useMutation({
        onError: (err) => toast.error(err.message),
        onSuccess: async () => {
            toast.success('Reading deleted.');
            await utils.reading.listAdmin.invalidate();
        },
    });
    const delBulk = api.reading.deleteBulk.useMutation({
        onError: (err) => toast.error(err.message),
        onSuccess: async (r) => {
            toast.success(`Deleted ${r.deleted} reading(s).`);
            setSelected([]);
            await utils.reading.listAdmin.invalidate();
        },
    });

    const rows = readings.data ?? [];
    const sensorMap = useMemo(
        () => new Map(sensors.data?.map((s) => [s.id, s])),
        [sensors.data],
    );
    const deviceMap = useMemo(
        () => new Map(devices.data?.map((d) => [d.id, d.name])),
        [devices.data],
    );

    const columns = useMemo<ColumnDef<ReadingRow>[]>(
        () => [
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
                cell: ({ row }) => {
                    const sens = sensorMap.get(row.original.sensor_id);
                    return (
                        <span className="font-medium text-white tabular-nums">
                            {row.original.value}
                            {sens?.unit ? ` ${sens.unit}` : ''}
                        </span>
                    );
                },
                header: 'Value',
            },
            {
                accessorFn: (row) =>
                    sensorMap.get(row.sensor_id)?.name ??
                    `sensor#${row.sensor_id}`,
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground">
                        {sensorMap.get(row.original.sensor_id)?.name ??
                            `sensor#${row.original.sensor_id}`}
                    </span>
                ),
                header: 'Sensor',
                id: 'sensor',
            },
            {
                accessorFn: (row) =>
                    deviceMap.get(row.device_id) ?? `device#${row.device_id}`,
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground">
                        {deviceMap.get(row.original.device_id) ??
                            `device#${row.original.device_id}`}
                    </span>
                ),
                header: 'Device',
                id: 'device',
            },
            {
                accessorKey: 'created_at',
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground">
                        {new Date(row.original.created_at).toLocaleString()}
                    </span>
                ),
                header: 'Recorded',
            },
            {
                cell: ({ row }) => (
                    <div className="flex justify-end">
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button size="sm" variant="outline">
                                    <Trash2 className="size-3.5" />
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>
                                        Delete reading?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                        {row.original.value}
                                        {sensorMap.get(row.original.sensor_id)
                                            ?.unit
                                            ? ` ${sensorMap.get(row.original.sensor_id)?.unit}`
                                            : ''}{' '}
                                        at{' '}
                                        {new Date(
                                            row.original.created_at,
                                        ).toLocaleString()}
                                        .
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>
                                        Cancel
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={() =>
                                            del.mutate({ id: row.original.id })
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
        [del, deviceMap, sensorMap],
    );

    return (
        <Card>
            <CardHeader>
                <CardTitle>Readings</CardTitle>
                {selected.length > 0 && (
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button size="sm" variant="destructive">
                                <Trash2 className="mr-1 size-3.5" />
                                Delete {selected.length}
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>
                                    Delete {selected.length} reading(s)?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                    This cannot be undone.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={() =>
                                        delBulk.mutate({
                                            ids: selected.map((r) => r.id),
                                        })
                                    }
                                >
                                    Delete
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                )}
            </CardHeader>
            <Separator />
            <CardContent className="flex flex-col gap-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <FilterField
                        label="Location"
                        onChange={setLocFilter}
                        options={(locations.data ?? []).map((l) => ({
                            id: String(l.id),
                            name: l.name,
                        }))}
                        value={locFilter}
                    />
                    <FilterField
                        label="Device"
                        onChange={setDevFilter}
                        options={(devices.data ?? []).map((d) => ({
                            id: String(d.id),
                            name: d.name,
                        }))}
                        value={devFilter}
                    />
                    <FilterField
                        label="Sensor"
                        onChange={setSensFilter}
                        options={(sensors.data ?? []).map((s) => ({
                            id: String(s.id),
                            name: s.name,
                        }))}
                        value={sensFilter}
                    />
                </div>

                <DataTable
                    columns={columns}
                    data={rows}
                    emptyMessage="No readings match these filters."
                    isLoading={readings.isLoading}
                    onRowSelectionChange={setSelected}
                    pageSize={25}
                    rowId={(r) => String(r.id)}
                    rowSelection
                />
            </CardContent>
        </Card>
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
            <Select onChange={(e) => onChange(e.target.value)} value={value}>
                <option value={ALL}>All</option>
                {options.map((o) => (
                    <option key={o.id} value={o.id}>
                        {o.name}
                    </option>
                ))}
            </Select>
        </div>
    );
}
