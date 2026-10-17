'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AudioLines, Download, Pencil, Plus } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { ProfileFormDialog } from '~/app/(app)/profile/_components/ProfileFormDialog';
import {
    ProfileIdSelectField,
    ProfileTextField,
} from '~/app/(app)/profile/_components/ProfileFormFields';
import { ProfilePanel } from '~/app/(app)/profile/_components/ProfilePanel';
import {
    MutedCell,
    PrimaryCell,
    profileActionsColumn,
    ProfileDateCell,
    ProfileDatePrecision,
    ProfileTableEmpty,
    RowActionButton,
    RowActionLink,
    RowConfirmAction,
} from '~/app/(app)/profile/_components/ProfileTable';
import { Button } from '~/components/ui/button';
import {
    DataTable,
    type DataTableColumn,
    dataTableExpanderColumn,
    hasActiveTableFilter,
} from '~/components/ui/data-table';
import { Dialog, DialogTrigger } from '~/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { DurationFormat } from '~/lib/lifting/format';
import {
    type RecordingCreateAdminInput,
    recordingCreateAdminSchema,
    type RecordingRenameInput,
    recordingRenameSchema,
} from '~/lib/schemas/sensor-hub';
import { apiRoutes } from '~/lib/site/routes';
import { api } from '~/trpc/react';

import { SensorHubScopeFilters, useSensorHubScope } from './SensorHubScope';

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
    const utilities = api.useUtils();
    const locations = api.location.listAdmin.useQuery();
    const devices = api.device.listAdmin.useQuery();

    const scope = useSensorHubScope();

    const recordings = api.recording.listAdmin.useQuery({
        device_id: scope.scope.deviceId,
        limit: 200,
        location_id: scope.scope.locationId,
    });

    const del = api.recording.delete.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Recording deleted.');
            await utilities.recording.listAdmin.invalidate();
        },
    });
    const recordingCreateMutation = api.recording.createAdmin.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Recording created.');
            await utilities.recording.listAdmin.invalidate();
        },
    });
    const [newOpen, setNewOpen] = useState(false);
    const rename = api.recording.rename.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async () => {
            toast.success('Recording renamed.');
            await utilities.recording.listAdmin.invalidate();
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

    const columns = useMemo<DataTableColumn<RecordingRow>[]>(
        () => [
            dataTableExpanderColumn<RecordingRow>(),
            {
                accessorKey: 'file_name',
                cell: ({ row }) => (
                    <PrimaryCell>{row.original.file_name}</PrimaryCell>
                ),
                header: 'File',
            },
            {
                accessorFn: (row) =>
                    locMap.get(row.location_id) ?? `loc#${row.location_id}`,
                cell: ({ getValue }) => (
                    <MutedCell>{String(getValue())}</MutedCell>
                ),
                header: 'Location',
                id: 'location',
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
                accessorKey: 'duration_seconds',
                cell: ({ row }) => (
                    <MutedCell>
                        {row.original.duration_seconds == null
                            ? '-'
                            : DurationFormat.seconds(
                                  row.original.duration_seconds,
                              )}
                    </MutedCell>
                ),
                header: 'Duration',
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
            profileActionsColumn<RecordingRow>((recording) => (
                <>
                    <RowActionLink
                        download={recording.file_name}
                        href={apiRoutes.recording(recording.id)}
                        icon={Download}
                        label="Download recording"
                    />
                    <RowActionButton
                        icon={Pencil}
                        label="Rename recording"
                        onClick={() => setRenaming(recording)}
                    />
                    <RowConfirmAction
                        description="The audio file is removed from the database."
                        label="Delete recording"
                        onConfirm={() => del.mutate({ id: recording.id })}
                        title={`Delete “${recording.file_name}”?`}
                    />
                </>
            )),
        ],
        [del, deviceMap, locMap],
    );

    const newButton = (
        <DialogTrigger asChild>
            <Button size="sm">
                <Plus className="size-4" />
                New recording
            </Button>
        </DialogTrigger>
    );

    return (
        <>
            <Dialog onOpenChange={setNewOpen} open={newOpen}>
                <ProfilePanel
                    action={newButton}
                    description="Audio clips uploaded by devices. Expand a row to play it."
                    title="Recordings"
                >
                    <DataTable
                        columns={columns}
                        data={rows}
                        emptyState={(table) => (
                            <ProfileTableEmpty
                                action={newButton}
                                description="Recordings appear here as devices upload them."
                                filtered={
                                    scope.isActive ||
                                    hasActiveTableFilter(table)
                                }
                                icon={AudioLines}
                                noun="recordings"
                            />
                        )}
                        filterPlaceholder="Search recordings…"
                        getRowCanExpand={() => true}
                        hasExternalFilters={scope.isActive}
                        headerActions={
                            <SensorHubScopeFilters
                                controller={scope}
                                devices={devices.data ?? []}
                                locations={locations.data ?? []}
                            />
                        }
                        isLoading={recordings.isLoading}
                        onResetFilters={scope.reset}
                        pageSize={20}
                        renderExpanded={(row) => (
                            <div className="flex flex-col gap-2 bg-background p-3">
                                <p className="text-xs text-muted-foreground">
                                    Playing: {row.original.file_name}
                                </p>
                                <audio
                                    className="w-full"
                                    controls
                                    preload="none"
                                    src={apiRoutes.recording(row.original.id)}
                                >
                                    <track kind="captions" />
                                </audio>
                            </div>
                        )}
                        rowId={(r) => String(r.id)}
                        showFilter
                    />
                </ProfilePanel>
                <NewRecordingDialog
                    devices={(devices.data ?? []).map((d) => ({
                        id: d.id,
                        label: d.name,
                    }))}
                    onClose={() => setNewOpen(false)}
                    onSubmit={(v) =>
                        recordingCreateMutation.mutate(v, {
                            onSuccess: () => setNewOpen(false),
                        })
                    }
                    pending={recordingCreateMutation.isPending}
                />
            </Dialog>

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
        </>
    );
}

function NewRecordingDialog({
    devices,
    onClose,
    onSubmit,
    pending,
}: {
    devices: { id: number; label: string }[];
    onClose: () => void;
    onSubmit: (v: RecordingCreateAdminInput) => void;
    pending: boolean;
}) {
    const [reading, setReading] = useState(false);

    const form = useForm<RecordingCreateAdminInput>({
        defaultValues: { deviceId: 0, fileBase64: '', fileName: '' },
        resolver: zodResolver(recordingCreateAdminSchema),
    });
    const formId = useId();

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
        <ProfileFormDialog
            form={form}
            onCancel={onClose}
            onSubmit={onSubmit}
            pending={pending}
            submitDisabled={reading}
            submitLabel="Create"
            title="New recording"
        >
            <ProfileIdSelectField
                control={form.control}
                label="Device"
                name="deviceId"
                options={devices}
                placeholder="Pick a device"
            />
            <Controller
                control={form.control}
                name="fileBase64"
                render={({ fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-fileBase64`}>
                            WAV file (max 10 MB)
                        </FieldLabel>
                        <Input
                            accept=".wav,audio/wav,audio/x-wav"
                            aria-invalid={fieldState.invalid}
                            id={`${formId}-fileBase64`}
                            onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) handleFile(file);
                            }}
                            type="file"
                        />
                        {fileName && (
                            <p className="text-xs text-muted-foreground">
                                {reading ? `Reading ${fileName}…` : fileName}
                            </p>
                        )}
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
        </ProfileFormDialog>
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
        <ProfileFormDialog
            form={form}
            onCancel={onClose}
            onSubmit={onSubmit}
            pending={pending}
            submitLabel="Save"
            title="Rename recording"
        >
            <ProfileTextField
                control={form.control}
                label="File name"
                name="file_name"
            />
        </ProfileFormDialog>
    );
}
