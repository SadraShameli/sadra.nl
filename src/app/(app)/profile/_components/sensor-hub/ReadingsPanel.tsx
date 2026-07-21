'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type ColumnDef } from '@tanstack/react-table';
import { Activity, Plus, Trash2 } from 'lucide-react';
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
import { Checkbox } from '~/components/ui/Checkbox';
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
    type ReadingCreateAdminInput,
    readingCreateAdminSchema,
} from '~/lib/schemas/sensor-hub';
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
    const utilities = api.useUtils();
    const locations = api.location.listAdmin.useQuery();
    const devices = api.device.listAdmin.useQuery();
    const sensors = api.sensor.listAdmin.useQuery();

    const [locFilter, setLocFilter] = useState(ALL);
    const [developmentFilter, setDevelopmentFilter] = useState(ALL);
    const [sensFilter, setSensFilter] = useState(ALL);
    const [selected, setSelected] = useState<ReadingRow[]>([]);
    const hasFilters =
        locFilter !== ALL || developmentFilter !== ALL || sensFilter !== ALL;
    const resetFilters = () => {
        setLocFilter(ALL);
        setDevelopmentFilter(ALL);
        setSensFilter(ALL);
    };

    const readings = api.reading.listAdmin.useQuery({
        device_id:
            developmentFilter === ALL ? undefined : Number(developmentFilter),
        limit: 500,
        location_id: locFilter === ALL ? undefined : Number(locFilter),
        sensor_id: sensFilter === ALL ? undefined : Number(sensFilter),
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
                <div className="flex items-center gap-2">
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
                                    <AlertDialogCancel>
                                        Cancel
                                    </AlertDialogCancel>
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
                    <Dialog onOpenChange={setNewOpen} open={newOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm">
                                <Plus className="mr-1 size-4" />
                                New reading
                            </Button>
                        </DialogTrigger>
                        <NewReadingDialog
                            devices={(devices.data ?? []).map((d) => ({
                                id: d.id,
                                name: d.name,
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
                </div>
            </CardHeader>
            <Separator />
            <CardContent className="flex flex-col gap-3">
                <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
                        onChange={setDevelopmentFilter}
                        options={(devices.data ?? []).map((d) => ({
                            id: String(d.id),
                            name: d.name,
                        }))}
                        value={developmentFilter}
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
                    emptyState={
                        <EmptyState
                            description="Adjust the filters to widen your search."
                            icon={Activity}
                            title="No readings"
                        />
                    }
                    headerActions={
                        <ClearFiltersButton
                            active={hasFilters}
                            onReset={resetFilters}
                        />
                    }
                    isLoading={readings.isLoading}
                    onRowSelectionChange={setSelected}
                    pageSize={25}
                    rowId={(r) => String(r.id)}
                    rowSelection
                    showFilter
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

function NewReadingDialog({
    devices,
    onClose,
    onSubmit,
    pending,
    sensors,
}: {
    devices: { id: number; name: string }[];
    onClose: () => void;
    onSubmit: (v: ReadingCreateAdminInput) => void;
    pending: boolean;
    sensors: { id: number; name: string; unit: null | string }[];
}) {
    const form = useForm<ReadingCreateAdminInput>({
        defaultValues: { deviceId: 0, sensorId: 0, value: 0 },
        resolver: zodResolver(readingCreateAdminSchema),
    });
    const sensorId = form.watch('sensorId');
    const selectedUnit = sensors.find((s) => s.id === sensorId)?.unit;
    return (
        <DialogContent>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                    <DialogHeader>
                        <DialogTitle>New reading</DialogTitle>
                    </DialogHeader>
                    <div className="mt-4 flex flex-col gap-3">
                        <FormField
                            control={form.control}
                            name="deviceId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Device</FormLabel>
                                    <Select
                                        onValueChange={(v) =>
                                            field.onChange(Number(v))
                                        }
                                        value={
                                            field.value
                                                ? String(field.value)
                                                : ''
                                        }
                                    >
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Pick a device" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {devices.map((d) => (
                                                <SelectItem
                                                    key={d.id}
                                                    value={String(d.id)}
                                                >
                                                    {d.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="sensorId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Sensor</FormLabel>
                                    <Select
                                        onValueChange={(v) =>
                                            field.onChange(Number(v))
                                        }
                                        value={
                                            field.value
                                                ? String(field.value)
                                                : ''
                                        }
                                    >
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Pick a sensor" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {sensors.map((s) => (
                                                <SelectItem
                                                    key={s.id}
                                                    value={String(s.id)}
                                                >
                                                    {s.name}
                                                    {s.unit
                                                        ? ` (${s.unit})`
                                                        : ''}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="value"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>
                                        Value
                                        {selectedUnit
                                            ? ` (${selectedUnit})`
                                            : ''}
                                    </FormLabel>
                                    <FormControl>
                                        <Input
                                            inputMode="decimal"
                                            onChange={(event) => {
                                                const n = Number(
                                                    event.target.value,
                                                );
                                                field.onChange(
                                                    Number.isFinite(n) ? n : 0,
                                                );
                                            }}
                                            placeholder="0"
                                            ref={field.ref}
                                            step="any"
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
