'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type ColumnDef } from '@tanstack/react-table';
import { AudioLines, Download, Pencil, Plus, Trash2 } from 'lucide-react';
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
import { DurationFormat } from '~/lib/lifting/format';
import {
    type RecordingCreateAdminInput,
    recordingCreateAdminSchema,
    type RecordingRenameInput,
    recordingRenameSchema,
} from '~/lib/schemas/sensor-hub';
import { apiRoutes } from '~/lib/site/routes';
import { api } from '~/trpc/react';

const ALL = '__all__';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

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
    const hasFilters = locFilter !== ALL || devFilter !== ALL;
    const resetFilters = () => {
        setLocFilter(ALL);
        setDevFilter(ALL);
    };

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
    const createRecording = api.recording.createAdmin.useMutation({
        onError: (err) => toast.error(err.message),
        onSuccess: async () => {
            toast.success('Recording created.');
            await utils.recording.listAdmin.invalidate();
        },
    });
    const [newOpen, setNewOpen] = useState(false);
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
                    <Button
                        className="h-auto justify-start p-0 font-medium text-foreground hover:text-primary"
                        onClick={() =>
                            setPreviewing(
                                previewing === row.original.id
                                    ? null
                                    : row.original.id,
                            )
                        }
                        size="sm"
                        type="button"
                        variant="link"
                    >
                        {row.original.file_name}
                    </Button>
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
                            : DurationFormat.seconds(
                                  row.original.duration_seconds,
                              )}
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
                <Dialog onOpenChange={setNewOpen} open={newOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm">
                            <Plus className="mr-1 size-4" />
                            New recording
                        </Button>
                    </DialogTrigger>
                    <NewRecordingDialog
                        devices={(devices.data ?? []).map((d) => ({
                            id: d.id,
                            name: d.name,
                        }))}
                        onClose={() => setNewOpen(false)}
                        onSubmit={(v) =>
                            createRecording.mutate(v, {
                                onSuccess: () => setNewOpen(false),
                            })
                        }
                        pending={createRecording.isPending}
                    />
                </Dialog>
            </CardHeader>
            <Separator />
            <CardContent className="flex flex-col gap-3">
                <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">Location</Label>
                        <Select onValueChange={setLocFilter} value={locFilter}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={ALL}>All</SelectItem>
                                {(locations.data ?? []).map((l) => (
                                    <SelectItem key={l.id} value={String(l.id)}>
                                        {l.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">Device</Label>
                        <Select onValueChange={setDevFilter} value={devFilter}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={ALL}>All</SelectItem>
                                {(devices.data ?? []).map((d) => (
                                    <SelectItem key={d.id} value={String(d.id)}>
                                        {d.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
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
                            preload="none"
                            src={apiRoutes.recording(previewingRow.id)}
                        />
                    </div>
                )}

                <DataTable
                    columns={columns}
                    data={rows}
                    emptyState={
                        <EmptyState
                            description="Adjust the filters or record a new clip."
                            icon={AudioLines}
                            title="No recordings"
                        />
                    }
                    headerActions={
                        <ClearFiltersButton
                            active={hasFilters}
                            onReset={resetFilters}
                        />
                    }
                    isLoading={recordings.isLoading}
                    pageSize={20}
                    rowId={(r) => String(r.id)}
                    showFilter
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

function NewRecordingDialog({
    devices,
    onClose,
    onSubmit,
    pending,
}: {
    devices: { id: number; name: string }[];
    onClose: () => void;
    onSubmit: (v: RecordingCreateAdminInput) => void;
    pending: boolean;
}) {
    const [reading, setReading] = useState(false);

    const form = useForm<RecordingCreateAdminInput>({
        defaultValues: { deviceId: 0, fileBase64: '', fileName: '' },
        resolver: zodResolver(recordingCreateAdminSchema),
    });

    const handleFile = (file: File) => {
        const isWav =
            file.type === 'audio/wav' ||
            file.type === 'audio/x-wav' ||
            file.name.toLowerCase().endsWith('.wav');
        if (!isWav) {
            toast.error('Only .wav files are accepted.');
            return;
        }
        if (file.size > MAX_AUDIO_BYTES) {
            toast.error('Audio file too large (max 10 MB).');
            return;
        }
        setReading(true);
        form.setValue('fileName', file.name, { shouldValidate: true });
        const fileReader = new FileReader();
        fileReader.addEventListener('load', () => {
            const dataUrl =
                typeof fileReader.result === 'string' ? fileReader.result : '';
            const comma = dataUrl.indexOf(',');
            form.setValue(
                'fileBase64',
                comma === -1 ? '' : dataUrl.slice(comma + 1),
                { shouldValidate: true },
            );
            setReading(false);
        });
        fileReader.addEventListener('error', () => {
            toast.error('Failed to read audio file.');
            setReading(false);
        });
        fileReader.readAsDataURL(file);
    };

    const fileName = form.watch('fileName');

    return (
        <DialogContent>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                    <DialogHeader>
                        <DialogTitle>New recording</DialogTitle>
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
                            name="fileBase64"
                            render={() => (
                                <FormItem>
                                    <FormLabel>WAV file (max 10 MB)</FormLabel>
                                    <FormControl>
                                        <Input
                                            accept=".wav,audio/wav,audio/x-wav"
                                            onChange={(e) => {
                                                const file =
                                                    e.target.files?.[0];
                                                if (file) handleFile(file);
                                            }}
                                            type="file"
                                        />
                                    </FormControl>
                                    {fileName && (
                                        <p className="text-[11px] text-muted-foreground">
                                            {fileName}
                                        </p>
                                    )}
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                    <DialogFooter className="mt-4">
                        <Button onClick={onClose} type="button" variant="ghost">
                            Cancel
                        </Button>
                        <Button disabled={pending || reading} type="submit">
                            {reading ? 'Reading…' : 'Create'}
                        </Button>
                    </DialogFooter>
                </form>
            </Form>
        </DialogContent>
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
    return (
        <DialogContent>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                    <DialogHeader>
                        <DialogTitle>Rename recording</DialogTitle>
                    </DialogHeader>
                    <FormField
                        control={form.control}
                        name="file_name"
                        render={({ field }) => (
                            <FormItem className="mt-4">
                                <FormLabel>File name</FormLabel>
                                <FormControl>
                                    <Input {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
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
