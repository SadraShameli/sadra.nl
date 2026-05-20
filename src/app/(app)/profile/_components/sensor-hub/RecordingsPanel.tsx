'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type ColumnDef } from '@tanstack/react-table';
import { Download, Pencil, Trash2 } from 'lucide-react';
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
import { DataTable } from '~/components/ui/DataTable';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '~/components/ui/Dialog';
import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import { Select } from '~/components/ui/Select';
import { Separator } from '~/components/ui/Separator';
import { apiRoutes } from '~/lib/routes';
import {
    type RecordingRenameInput,
    recordingRenameSchema,
} from '~/lib/schemas/sensor-hub';
import { api } from '~/trpc/react';

const ALL = '__all__';

type RecordingRow = {
    created_at: Date;
    device_id: number;
    duration_seconds: null | number;
    file_name: string;
    id: number;
    location_id: number;
};

export function RecordingsPanel() {
    const utils = api.useUtils();
    const locations = api.location.listAdmin.useQuery();
    const devices = api.device.listAdmin.useQuery();

    const [locFilter, setLocFilter] = useState(ALL);
    const [devFilter, setDevFilter] = useState(ALL);
    const [previewing, setPreviewing] = useState<null | number>(null);

    const recordings = api.recording.listAdmin.useQuery({
        device_id: devFilter === ALL ? undefined : Number(devFilter),
        limit: 200,
        location_id: locFilter === ALL ? undefined : Number(locFilter),
    });

    const del = api.recording.delete.useMutation({
        onError: (err) => toast.error(err.message),
        onSuccess: async () => {
            toast.success('Recording deleted.');
            await utils.recording.listAdmin.invalidate();
        },
    });
    const rename = api.recording.rename.useMutation({
        onError: (err) => toast.error(err.message),
        onSuccess: async () => {
            toast.success('Recording renamed.');
            await utils.recording.listAdmin.invalidate();
        },
    });

    const [renaming, setRenaming] = useState<null | RecordingRow>(null);

    const rows = recordings.data ?? [];
    const deviceMap = useMemo(
        () => new Map(devices.data?.map((d) => [d.id, d.name])),
        [devices.data],
    );
    const locMap = useMemo(
        () => new Map(locations.data?.map((l) => [l.id, l.name])),
        [locations.data],
    );

    const columns = useMemo<ColumnDef<RecordingRow>[]>(
        () => [
            {
                accessorKey: 'file_name',
                cell: ({ row }) => (
                    <button
                        className="text-left font-medium text-white transition-colors hover:text-primary"
                        onClick={() =>
                            setPreviewing(
                                previewing === row.original.id
                                    ? null
                                    : row.original.id,
                            )
                        }
                        type="button"
                    >
                        {row.original.file_name}
                    </button>
                ),
                header: 'File',
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
                accessorKey: 'duration_seconds',
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground tabular-nums">
                        {row.original.duration_seconds == null
                            ? '—'
                            : `${Math.round(row.original.duration_seconds)}s`}
                    </span>
                ),
                header: 'Duration',
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
                    <div className="flex justify-end gap-2">
                        <Button asChild size="sm" variant="outline">
                            <a
                                download={row.original.file_name}
                                href={apiRoutes.recording(row.original.id)}
                                title="Download"
                            >
                                <Download className="size-3.5" />
                            </a>
                        </Button>
                        <Button
                            onClick={() => setRenaming(row.original)}
                            size="sm"
                            title="Rename"
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
                                        Delete &ldquo;{row.original.file_name}
                                        &rdquo;?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                        The audio file is removed from the
                                        database.
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
        [del, deviceMap, locMap, previewing],
    );

    const previewingRow = rows.find((r) => r.id === previewing);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Recordings</CardTitle>
            </CardHeader>
            <Separator />
            <CardContent className="flex flex-col gap-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">Location</Label>
                        <Select
                            onChange={(e) => setLocFilter(e.target.value)}
                            value={locFilter}
                        >
                            <option value={ALL}>All</option>
                            {(locations.data ?? []).map((l) => (
                                <option key={l.id} value={String(l.id)}>
                                    {l.name}
                                </option>
                            ))}
                        </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">Device</Label>
                        <Select
                            onChange={(e) => setDevFilter(e.target.value)}
                            value={devFilter}
                        >
                            <option value={ALL}>All</option>
                            {(devices.data ?? []).map((d) => (
                                <option key={d.id} value={String(d.id)}>
                                    {d.name}
                                </option>
                            ))}
                        </Select>
                    </div>
                </div>

                {previewingRow && (
                    <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-background p-3">
                        <p className="text-xs text-muted-foreground">
                            Playing: {previewingRow.file_name}
                        </p>
                        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                        <audio
                            className="w-full"
                            controls
                            preload="auto"
                            src={`/api/recording/${previewingRow.id}`}
                        />
                    </div>
                )}

                <DataTable
                    columns={columns}
                    data={rows}
                    emptyMessage="No recordings match."
                    isLoading={recordings.isLoading}
                    pageSize={20}
                    rowId={(r) => String(r.id)}
                />
            </CardContent>

            <Dialog
                onOpenChange={(o) => !o && setRenaming(null)}
                open={renaming !== null}
            >
                {renaming && (
                    <RenameDialog
                        initial={renaming}
                        onClose={() => setRenaming(null)}
                        onSubmit={(v) =>
                            rename.mutate(v, {
                                onSuccess: () => setRenaming(null),
                            })
                        }
                        pending={rename.isPending}
                    />
                )}
            </Dialog>
        </Card>
    );
}

function RenameDialog({
    initial,
    onClose,
    onSubmit,
    pending,
}: {
    initial: RecordingRow;
    onClose: () => void;
    onSubmit: (v: RecordingRenameInput) => void;
    pending: boolean;
}) {
    const form = useForm<RecordingRenameInput>({
        defaultValues: { file_name: initial.file_name, id: initial.id },
        resolver: zodResolver(recordingRenameSchema),
    });
    const submit = form.handleSubmit(onSubmit);
    return (
        <DialogContent>
            <form onSubmit={submit}>
                <DialogHeader>
                    <DialogTitle>Rename recording</DialogTitle>
                </DialogHeader>
                <div className="mt-4 flex flex-col gap-1.5">
                    <Label>File name</Label>
                    <Input {...form.register('file_name')} />
                    {form.formState.errors.file_name && (
                        <p className="text-xs text-destructive">
                            {form.formState.errors.file_name.message}
                        </p>
                    )}
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
