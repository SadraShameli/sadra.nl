'use client';

import {
    Activity,
    AlertTriangle,
    Cpu,
    type LucideIcon,
    MapPin,
    Mic,
} from 'lucide-react';
import { useMemo } from 'react';
import { toast } from 'sonner';

import { ProfilePanel } from '~/app/(app)/profile/_components/ProfilePanel';
import {
    MutedCell,
    PrimaryCell,
} from '~/app/(app)/profile/_components/ProfileTable';
import {
    DataTable,
    DataTableAlign,
    type DataTableColumn,
} from '~/components/ui/data-table';
import { Switch } from '~/components/ui/switch';
import { EVENT_LABELS, EVENT_TYPES, type EventType } from '~/lib/notify/types';
import { api } from '~/trpc/react';

const ICONS: Record<EventType, LucideIcon> = {
    device_created: Cpu,
    location_created: MapPin,
    loudness_alert: AlertTriangle,
    reading_created: Activity,
    recording_created: Mic,
};

const DESCRIPTIONS: Record<EventType, string> = {
    device_created: 'When a new device is registered.',
    location_created: 'When a new location is created.',
    loudness_alert: 'When a reading exceeds the device loudness threshold.',
    reading_created: 'When any sensor reading is recorded.',
    recording_created: 'When a new audio recording is uploaded.',
};

type SubscriptionRow = { enabled: boolean; eventType: EventType };

export function SubscriptionsPanel() {
    const utilities = api.useUtils();
    const prefs = api.user.notification.getMyPrefs.useQuery();
    const notificationPrefMutation = api.user.notification.setPref.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: async (_data, variables) => {
            const label = EVENT_LABELS[variables.eventType];
            toast.success(
                variables.enabled
                    ? `Subscribed to “${label}”`
                    : `Unsubscribed from “${label}”`,
            );
            await utilities.user.notification.getMyPrefs.invalidate();
        },
    });

    const rows = useMemo<SubscriptionRow[]>(
        () =>
            EVENT_TYPES.map((eventType) => ({
                enabled: prefs.data?.[eventType] ?? false,
                eventType,
            })),
        [prefs.data],
    );

    const columns = useMemo<DataTableColumn<SubscriptionRow>[]>(
        () => [
            {
                accessorFn: (row) => EVENT_LABELS[row.eventType],
                cell: ({ row }) => {
                    const Icon = ICONS[row.original.eventType];
                    return (
                        <span className="flex items-center gap-2">
                            <Icon className="size-4 text-muted-foreground" />
                            <PrimaryCell>
                                {EVENT_LABELS[row.original.eventType]}
                            </PrimaryCell>
                        </span>
                    );
                },
                header: 'Event',
                id: 'event',
            },
            {
                cell: ({ row }) => (
                    <MutedCell>
                        {DESCRIPTIONS[row.original.eventType]}
                    </MutedCell>
                ),
                enableSorting: false,
                header: 'Sent',
                id: 'description',
            },
            {
                cell: ({ row }) => (
                    <Switch
                        aria-label={`Email me ${EVENT_LABELS[row.original.eventType]}`}
                        checked={row.original.enabled}
                        disabled={notificationPrefMutation.isPending}
                        onCheckedChange={(enabled) =>
                            notificationPrefMutation.mutate({
                                enabled,
                                eventType: row.original.eventType,
                            })
                        }
                    />
                ),
                enableSorting: false,
                header: 'Email',
                id: 'email',
                meta: { align: DataTableAlign.End },
            },
        ],
        [notificationPrefMutation],
    );

    return (
        <ProfilePanel
            description="Choose which Sensor Hub events send you an email."
            title="Email subscriptions"
        >
            <DataTable
                columns={columns}
                data={rows}
                isLoading={prefs.isLoading}
                pageSize={null}
                rowId={(r) => r.eventType}
                skeletonRows={EVENT_TYPES.length}
            />
        </ProfilePanel>
    );
}
