'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Copy, Cpu, Key, Pencil, Plus, ShieldOff, Sliders } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { ProfileFormDialog } from '~/app/(app)/profile/_components/ProfileFormDialog';
import {
    ProfileIdSelectField,
    ProfileNumberField,
    ProfileTextField,
} from '~/app/(app)/profile/_components/ProfileFormFields';
import { ProfilePanel } from '~/app/(app)/profile/_components/ProfilePanel';
import {
    MutedCell,
    PrimaryCell,
    profileActionsColumn,
    ProfileTableEmpty,
    RowActionButton,
    RowConfirmAction,
} from '~/app/(app)/profile/_components/ProfileTable';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import {
    DataTable,
    type DataTableColumn,
    DataTableFilterFunction,
    hasActiveTableFilter,
} from '~/components/ui/data-table';
import { DataTableFacetSelect } from '~/components/ui/data-table-facet-select';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '~/components/ui/dialog';
import {
    type DeviceCreateInput,
    deviceCreateSchema,
} from '~/lib/schemas/sensor-hub';
import { api, type RouterOutputs } from '~/trpc/react';

type DeviceRow = RouterOutputs['device']['listAdmin'][number];

type LocationOption = { id: number; name: string };

const DeviceColumn = {
    Location: 'location',
} as const;

export function DevicesPanel() {
    const utilities = api.useUtils();
    const devices = api.device.listAdmin.useQuery();
    const locations = api.location.listAdmin.useQuery();
    const create = api.device.create.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Device created.');
            await utilities.device.listAdmin.invalidate();
        },
    });
    const update = api.device.update.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Device updated.');
            await utilities.device.listAdmin.invalidate();
        },
    });
    const del = api.device.delete.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Device deleted.');
            await utilities.device.listAdmin.invalidate();
        },
    });
    const issue = api.device.issueToken.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            await utilities.device.listAdmin.invalidate();
        },
    });
    const revoke = api.device.revokeToken.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Token revoked.');
            await utilities.device.listAdmin.invalidate();
        },
    });

    const [newOpen, setNewOpen] = useState(false);
    const [editing, setEditing] = useState<DeviceRow | null>(null);
    const [managingSensorsFor, setManagingSensorsFor] = useState<null | number>(
        null,
    );
    const [issuedToken, setIssuedToken] = useState<null | {
        deviceName: string;
        token: string;
    }>(null);

    const allRows = useMemo(() => devices.data ?? [], [devices.data]);
    const locOptions = useMemo(() => locations.data ?? [], [locations.data]);
    const locMap = useMemo(
        () => new Map(locOptions.map((l) => [l.id, l.name])),
        [locOptions],
    );

    const columns = useMemo<DataTableColumn<DeviceRow>[]>(
        () => [
            {
                accessorKey: 'name',
                cell: ({ row }) => (
                    <div className="flex flex-col">
                        <PrimaryCell>{row.original.name}</PrimaryCell>
                        <MutedCell>#{row.original.device_id}</MutedCell>
                    </div>
                ),
                header: 'Device',
            },
            {
                accessorFn: (row) =>
                    locMap.get(row.location_id) ?? `loc#${row.location_id}`,
                cell: ({ getValue }) => (
                    <MutedCell>{String(getValue())}</MutedCell>
                ),
                filterFn: DataTableFilterFunction.Equals,
                header: 'Location',
                id: DeviceColumn.Location,
            },
            {
                accessorKey: 'loudness_threshold',
                cell: ({ row }) => (
                    <MutedCell>{row.original.loudness_threshold}</MutedCell>
                ),
                header: 'Loudness',
            },
            {
                accessorKey: 'register_interval',
                cell: ({ row }) => (
                    <MutedCell>{row.original.register_interval}s</MutedCell>
                ),
                header: 'Interval',
            },
            {
                cell: ({ row }) => {
                    const d = row.original;
                    if (d.token_revoked_at) {
                        return (
                            <MutedCell className="text-destructive">
                                revoked
                            </MutedCell>
                        );
                    }
                    return d.has_token && d.token_created_at ? (
                        <MutedCell className="text-success">issued</MutedCell>
                    ) : (
                        <MutedCell>none</MutedCell>
                    );
                },
                header: 'Token',
                id: 'token',
            },
            profileActionsColumn<DeviceRow>((device) => (
                <>
                    <RowActionButton
                        disabled={
                            issue.isPending && issue.variables.id === device.id
                        }
                        icon={Key}
                        label={
                            device.has_token ? 'Rotate token' : 'Issue token'
                        }
                        onClick={() =>
                            issue.mutate(
                                { id: device.id },
                                {
                                    onSuccess: ({ token }) =>
                                        setIssuedToken({
                                            deviceName: device.name,
                                            token,
                                        }),
                                },
                            )
                        }
                    />
                    {device.has_token && !device.token_revoked_at && (
                        <RowActionButton
                            disabled={revoke.isPending}
                            icon={ShieldOff}
                            label="Revoke token"
                            onClick={() => revoke.mutate({ id: device.id })}
                        />
                    )}
                    <RowActionButton
                        icon={Sliders}
                        label="Manage sensors"
                        onClick={() => setManagingSensorsFor(device.id)}
                    />
                    <RowActionButton
                        icon={Pencil}
                        label="Edit device"
                        onClick={() => setEditing(device)}
                    />
                    <RowConfirmAction
                        description="Fails if readings or recordings reference this device."
                        label="Delete device"
                        onConfirm={() => del.mutate({ id: device.id })}
                        title={`Delete device “${device.name}”?`}
                    />
                </>
            )),
        ],
        [del, issue, locMap, revoke],
    );

    const newButton = (
        <DialogTrigger asChild>
            <Button size="sm">
                <Plus className="size-4" />
                New device
            </Button>
        </DialogTrigger>
    );

    return (
        <>
            <Dialog onOpenChange={setNewOpen} open={newOpen}>
                <ProfilePanel
                    action={newButton}
                    description="Sensor boards, their tokens and the sensors they carry."
                    title="Devices"
                >
                    <DataTable
                        columns={columns}
                        data={allRows}
                        emptyState={(table) => (
                            <ProfileTableEmpty
                                action={newButton}
                                description="Register a sensor device to start collecting readings."
                                filtered={hasActiveTableFilter(table)}
                                icon={Cpu}
                                noun="devices"
                            />
                        )}
                        filterPlaceholder="Search devices…"
                        headerActions={(table) => (
                            <DataTableFacetSelect
                                column={table.getColumn(DeviceColumn.Location)}
                                label="Location"
                                placeholder="All locations"
                            />
                        )}
                        isLoading={devices.isLoading}
                        rowId={(r) => String(r.id)}
                        showFilter
                    />
                </ProfilePanel>
                <DeviceDialog
                    initial={null}
                    locations={locOptions}
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
                    <DeviceDialog
                        initial={editing}
                        locations={locOptions}
                        onClose={() => setEditing(null)}
                        onSubmit={(v) =>
                            update.mutate(
                                {
                                    id: editing.id,
                                    location_id: v.location_id,
                                    loudness_threshold: v.loudness_threshold,
                                    name: v.name,
                                    register_interval: v.register_interval,
                                },
                                { onSuccess: () => setEditing(null) },
                            )
                        }
                        pending={update.isPending}
                    />
                )}
            </Dialog>

            <Dialog
                onOpenChange={(o) => !o && setManagingSensorsFor(null)}
                open={managingSensorsFor !== null}
            >
                {managingSensorsFor !== null && (
                    <ManageSensorsDialog
                        deviceId={managingSensorsFor}
                        onClose={() => setManagingSensorsFor(null)}
                    />
                )}
            </Dialog>

            <Dialog
                onOpenChange={(o) => !o && setIssuedToken(null)}
                open={issuedToken !== null}
            >
                {issuedToken && (
                    <IssuedTokenDialog
                        deviceName={issuedToken.deviceName}
                        onClose={() => setIssuedToken(null)}
                        token={issuedToken.token}
                    />
                )}
            </Dialog>
        </>
    );
}

function DeviceDialog({
    initial,
    locations,
    onClose,
    onSubmit,
    pending,
}: {
    initial: DeviceRow | null;
    locations: readonly LocationOption[];
    onClose: () => void;
    onSubmit: (v: DeviceCreateInput) => void;
    pending: boolean;
}) {
    const form = useForm<DeviceCreateInput>({
        defaultValues: {
            device_id: initial?.device_id ?? 0,
            location_id: initial?.location_id ?? locations[0]?.id ?? 0,
            loudness_threshold: initial?.loudness_threshold ?? 0,
            name: initial?.name ?? '',
            register_interval: initial?.register_interval ?? 0,
        },
        resolver: zodResolver(deviceCreateSchema),
    });
    return (
        <ProfileFormDialog
            form={form}
            onCancel={onClose}
            onSubmit={onSubmit}
            pending={pending}
            submitLabel={initial ? 'Save' : 'Create'}
            title={initial ? 'Edit device' : 'New device'}
        >
            <ProfileTextField control={form.control} label="Name" name="name" />
            {initial === null && (
                <ProfileNumberField
                    control={form.control}
                    label="Public device ID"
                    name="device_id"
                />
            )}
            <ProfileIdSelectField
                control={form.control}
                label="Location"
                name="location_id"
                options={locations.map((l) => ({ id: l.id, label: l.name }))}
                placeholder="Pick a location"
            />
            <div className="grid grid-cols-2 gap-3">
                <ProfileNumberField
                    control={form.control}
                    label="Loudness threshold"
                    name="loudness_threshold"
                />
                <ProfileNumberField
                    control={form.control}
                    label="Interval (s)"
                    name="register_interval"
                />
            </div>
        </ProfileFormDialog>
    );
}

function IssuedTokenDialog({
    deviceName,
    onClose,
    token,
}: {
    deviceName: string;
    onClose: () => void;
    token: string;
}) {
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(token);
            toast.success('Token copied.');
        } catch {
            toast.error('Clipboard unavailable.');
        }
    };
    return (
        <DialogContent>
            <DialogHeader>
                <DialogTitle>
                    Device token for &ldquo;{deviceName}&rdquo;
                </DialogTitle>
            </DialogHeader>
            <div className="mt-2 flex flex-col gap-3">
                <p className="text-xs text-muted-foreground">
                    Save this token somewhere safe and load it onto the device.
                    Any previous token for this device is invalidated.
                </p>
                <code className="block rounded-md border border-border bg-muted/40 p-3 font-mono text-xs break-all">
                    {token}
                </code>
            </div>
            <DialogFooter className="mt-4">
                <Button onClick={copy} type="button" variant="outline">
                    <Copy className="mr-1 size-3.5" /> Copy
                </Button>
                <Button onClick={onClose} type="button">
                    I&apos;ve saved it
                </Button>
            </DialogFooter>
        </DialogContent>
    );
}

function ManageSensorsDialog({
    deviceId,
    onClose,
}: {
    deviceId: number;
    onClose: () => void;
}) {
    const utilities = api.useUtils();
    const allSensors = api.sensor.listAdmin.useQuery();
    const devices = api.device.listAdmin.useQuery();
    const device = devices.data?.find((d) => d.id === deviceId);
    const deviceQuery = api.device.getDevice.useQuery(
        { device_id: device?.device_id ?? 0 },
        { enabled: !!device },
    );

    const [selected, setSelected] = useState<Set<number>>(new Set());
    useEffect(() => {
        if (
            deviceQuery.data &&
            'data' in deviceQuery.data &&
            deviceQuery.data.data
        ) {
            setSelected(new Set(deviceQuery.data.data.sensors));
        }
    }, [deviceQuery.data]);

    const save = api.sensor.setDeviceSensors.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Sensors updated.');
            await Promise.all([
                utilities.device.getDevice.invalidate(),
                utilities.sensor.listDeviceMappings.invalidate(),
            ]);
            onClose();
        },
    });

    const toggle = (id: number) => {
        setSelected((previous) => {
            const next = new Set(previous);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    return (
        <DialogContent>
            <DialogHeader>
                <DialogTitle>
                    Sensors for {device?.name ?? `device #${deviceId}`}
                </DialogTitle>
            </DialogHeader>
            <div className="flex max-h-80 flex-col gap-2 overflow-y-auto py-2">
                {(allSensors.data ?? []).map((s) => (
                    <label
                        className="flex cursor-pointer items-center gap-3 rounded-md border border-border/60 bg-background px-3 py-2 text-sm"
                        htmlFor={`sensor-${s.id}`}
                        key={s.id}
                    >
                        <Checkbox
                            checked={selected.has(s.id)}
                            id={`sensor-${s.id}`}
                            onCheckedChange={() => toggle(s.id)}
                        />
                        <span className="flex-1">
                            {s.name}{' '}
                            <span className="text-xs text-muted-foreground">
                                ({s.unit})
                            </span>
                        </span>
                    </label>
                ))}
                {(allSensors.data ?? []).length === 0 && (
                    <p className="py-2 text-center text-sm text-muted-foreground">
                        No sensors defined. Create one in the Sensors tab.
                    </p>
                )}
            </div>
            <DialogFooter>
                <Button onClick={onClose} variant="ghost">
                    Cancel
                </Button>
                <Button
                    disabled={save.isPending}
                    onClick={() =>
                        save.mutate({
                            deviceId,
                            sensorIds: [...selected],
                        })
                    }
                >
                    Save
                </Button>
            </DialogFooter>
        </DialogContent>
    );
}
