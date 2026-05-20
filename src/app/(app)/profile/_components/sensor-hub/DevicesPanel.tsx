'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type ColumnDef } from '@tanstack/react-table';
import {
    Copy,
    Key,
    Pencil,
    Plus,
    ShieldOff,
    Sliders,
    Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
import { Select } from '~/components/ui/Select';
import { Separator } from '~/components/ui/Separator';
import {
    type DeviceCreateInput,
    deviceCreateSchema,
    deviceUpdateSchema,
} from '~/lib/schemas/sensor-hub';
import { api } from '~/trpc/react';

type DeviceRow = {
    created_at: Date;
    device_id: number;
    id: number;
    location_id: number;
    loudness_threshold: number;
    name: string;
    register_interval: number;
    token_created_at: Date | null;
    token_hash: null | string;
    token_revoked_at: Date | null;
};

type EditDeviceValues = {
    location_id: number;
    loudness_threshold: number;
    name: string;
    register_interval: number;
};

export function DevicesPanel() {
    const utils = api.useUtils();
    const devices = api.device.listAdmin.useQuery();
    const locations = api.location.listAdmin.useQuery();
    const create = api.device.create.useMutation({
        onError: (err) => toast.error(err.message),
        onSuccess: async () => {
            toast.success('Device created.');
            await utils.device.listAdmin.invalidate();
        },
    });
    const update = api.device.update.useMutation({
        onError: (err) => toast.error(err.message),
        onSuccess: async () => {
            toast.success('Device updated.');
            await utils.device.listAdmin.invalidate();
        },
    });
    const del = api.device.delete.useMutation({
        onError: (err) => toast.error(err.message),
        onSuccess: async () => {
            toast.success('Device deleted.');
            await utils.device.listAdmin.invalidate();
        },
    });
    const issue = api.device.issueToken.useMutation({
        onError: (err) => toast.error(err.message),
        onSuccess: async () => {
            await utils.device.listAdmin.invalidate();
        },
    });
    const revoke = api.device.revokeToken.useMutation({
        onError: (err) => toast.error(err.message),
        onSuccess: async () => {
            toast.success('Token revoked.');
            await utils.device.listAdmin.invalidate();
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

    const rows = devices.data ?? [];
    const locOptions = useMemo(() => locations.data ?? [], [locations.data]);
    const locMap = useMemo(
        () => new Map(locOptions.map((l) => [l.id, l.name])),
        [locOptions],
    );

    const columns = useMemo<ColumnDef<DeviceRow>[]>(
        () => [
            {
                accessorKey: 'name',
                cell: ({ row }) => (
                    <div className="flex flex-col">
                        <span className="font-medium text-white">
                            {row.original.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                            #{row.original.device_id}
                        </span>
                    </div>
                ),
                header: 'Device',
            },
            {
                accessorFn: (row) =>
                    locMap.get(row.location_id) ?? `loc#${row.location_id}`,
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground">
                        {locMap.get(row.original.location_id) ??
                            `loc#${row.original.location_id}`}
                    </span>
                ),
                header: 'Location',
                id: 'location',
            },
            {
                accessorKey: 'loudness_threshold',
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground tabular-nums">
                        {row.original.loudness_threshold}
                    </span>
                ),
                header: 'Loudness',
            },
            {
                accessorKey: 'register_interval',
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground tabular-nums">
                        {row.original.register_interval}s
                    </span>
                ),
                header: 'Interval',
            },
            {
                cell: ({ row }) => {
                    const d = row.original;
                    if (d.token_revoked_at) {
                        return (
                            <span className="text-xs text-destructive">
                                revoked
                            </span>
                        );
                    }
                    if (d.token_hash && d.token_created_at) {
                        return (
                            <span className="text-xs text-emerald-400">
                                issued
                            </span>
                        );
                    }
                    return (
                        <span className="text-xs text-muted-foreground">
                            none
                        </span>
                    );
                },
                header: 'Token',
                id: 'token',
            },
            {
                cell: ({ row }) => (
                    <div className="flex justify-end gap-2">
                        <Button
                            disabled={
                                issue.isPending &&
                                issue.variables.id === row.original.id
                            }
                            onClick={() => {
                                issue.mutate(
                                    { id: row.original.id },
                                    {
                                        onSuccess: ({ token }) =>
                                            setIssuedToken({
                                                deviceName: row.original.name,
                                                token,
                                            }),
                                    },
                                );
                            }}
                            size="sm"
                            title={
                                row.original.token_hash
                                    ? 'Rotate token'
                                    : 'Issue token'
                            }
                            variant="outline"
                        >
                            <Key className="size-3.5" />
                        </Button>
                        {row.original.token_hash &&
                            !row.original.token_revoked_at && (
                                <Button
                                    disabled={revoke.isPending}
                                    onClick={() =>
                                        revoke.mutate({ id: row.original.id })
                                    }
                                    size="sm"
                                    title="Revoke token"
                                    variant="outline"
                                >
                                    <ShieldOff className="size-3.5" />
                                </Button>
                            )}
                        <Button
                            onClick={() =>
                                setManagingSensorsFor(row.original.id)
                            }
                            size="sm"
                            title="Manage sensors"
                            variant="outline"
                        >
                            <Sliders className="size-3.5" />
                        </Button>
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
                                        Delete device &ldquo;{row.original.name}
                                        &rdquo;?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Fails if readings or recordings
                                        reference this device.
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
        [del, issue, locMap, revoke],
    );

    return (
        <Card>
            <CardHeader>
                <CardTitle>Devices</CardTitle>
                <Dialog onOpenChange={setNewOpen} open={newOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm">
                            <Plus className="mr-1 size-4" />
                            New device
                        </Button>
                    </DialogTrigger>
                    <NewDeviceDialog
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
            </CardHeader>
            <Separator />
            <CardContent>
                <DataTable
                    columns={columns}
                    data={rows}
                    emptyMessage="No devices yet."
                    isLoading={devices.isLoading}
                    rowId={(r) => String(r.id)}
                    showFilter
                />
            </CardContent>

            <Dialog
                onOpenChange={(o) => !o && setEditing(null)}
                open={editing !== null}
            >
                {editing && (
                    <EditDeviceDialog
                        initial={editing}
                        locations={locOptions}
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
        </Card>
    );
}

function EditDeviceDialog({
    initial,
    locations,
    onClose,
    onSubmit,
    pending,
}: {
    initial: DeviceRow;
    locations: { id: number; name: string }[];
    onClose: () => void;
    onSubmit: (v: EditDeviceValues) => void;
    pending: boolean;
}) {
    const editSchema = deviceUpdateSchema.omit({ id: true });
    const form = useForm<EditDeviceValues>({
        defaultValues: {
            location_id: initial.location_id,
            loudness_threshold: initial.loudness_threshold,
            name: initial.name,
            register_interval: initial.register_interval,
        },
        resolver: zodResolver(editSchema),
    });
    const submit = form.handleSubmit(onSubmit);
    const { errors } = form.formState;
    return (
        <DialogContent>
            <form onSubmit={submit}>
                <DialogHeader>
                    <DialogTitle>Edit device</DialogTitle>
                </DialogHeader>
                <div className="mt-4 flex flex-col gap-3">
                    <Field error={errors.name?.message} label="Name">
                        <Input {...form.register('name')} />
                    </Field>
                    <Field error={errors.location_id?.message} label="Location">
                        <Select
                            {...form.register('location_id', {
                                valueAsNumber: true,
                            })}
                        >
                            {locations.map((l) => (
                                <option key={l.id} value={l.id}>
                                    {l.name}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field
                            error={errors.loudness_threshold?.message}
                            label="Loudness threshold"
                        >
                            <Input
                                inputMode="numeric"
                                {...form.register('loudness_threshold', {
                                    valueAsNumber: true,
                                })}
                            />
                        </Field>
                        <Field
                            error={errors.register_interval?.message}
                            label="Interval (s)"
                        >
                            <Input
                                inputMode="numeric"
                                {...form.register('register_interval', {
                                    valueAsNumber: true,
                                })}
                            />
                        </Field>
                    </div>
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
    const utils = api.useUtils();
    const allSensors = api.sensor.listAdmin.useQuery();
    const devices = api.device.listAdmin.useQuery();
    const device = devices.data?.find((d) => d.id === deviceId);
    const getDevice = api.device.getDevice.useQuery(
        device ? { device_id: device.device_id } : { device_id: 0 },
        { enabled: !!device },
    );

    const [selected, setSelected] = useState<Set<number>>(new Set());
    useEffect(() => {
        if (getDevice.data && 'data' in getDevice.data && getDevice.data.data) {
            setSelected(new Set(getDevice.data.data.sensors));
        }
    }, [getDevice.data]);

    const save = api.sensor.setDeviceSensors.useMutation({
        onError: (err) => toast.error(err.message),
        onSuccess: async () => {
            toast.success('Sensors updated.');
            await utils.device.getDevice.invalidate();
            onClose();
        },
    });

    const toggle = (id: number) => {
        setSelected((prev) => {
            const next = new Set(prev);
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

function NewDeviceDialog({
    locations,
    onClose,
    onSubmit,
    pending,
}: {
    locations: { id: number; name: string }[];
    onClose: () => void;
    onSubmit: (v: DeviceCreateInput) => void;
    pending: boolean;
}) {
    const form = useForm<DeviceCreateInput>({
        defaultValues: {
            device_id: 0,
            location_id: locations[0]?.id ?? 0,
            loudness_threshold: 0,
            name: '',
            register_interval: 0,
        },
        resolver: zodResolver(deviceCreateSchema),
    });
    const submit = form.handleSubmit(onSubmit);
    const { errors } = form.formState;
    return (
        <DialogContent>
            <form onSubmit={submit}>
                <DialogHeader>
                    <DialogTitle>New device</DialogTitle>
                </DialogHeader>
                <div className="mt-4 flex flex-col gap-3">
                    <Field error={errors.name?.message} label="Name">
                        <Input {...form.register('name')} />
                    </Field>
                    <Field
                        error={errors.device_id?.message}
                        label="Public device ID"
                    >
                        <Input
                            inputMode="numeric"
                            {...form.register('device_id', {
                                valueAsNumber: true,
                            })}
                        />
                    </Field>
                    <Field error={errors.location_id?.message} label="Location">
                        <Select
                            {...form.register('location_id', {
                                valueAsNumber: true,
                            })}
                        >
                            {locations.map((l) => (
                                <option key={l.id} value={l.id}>
                                    {l.name}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field
                            error={errors.loudness_threshold?.message}
                            label="Loudness threshold"
                        >
                            <Input
                                inputMode="numeric"
                                {...form.register('loudness_threshold', {
                                    valueAsNumber: true,
                                })}
                            />
                        </Field>
                        <Field
                            error={errors.register_interval?.message}
                            label="Interval (s)"
                        >
                            <Input
                                inputMode="numeric"
                                {...form.register('register_interval', {
                                    valueAsNumber: true,
                                })}
                            />
                        </Field>
                    </div>
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
