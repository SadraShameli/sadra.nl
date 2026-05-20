'use client';

import { Activity, AlertTriangle, Bell, Cpu, MapPin, Mic } from 'lucide-react';
import { toast } from 'sonner';

import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import { Separator } from '~/components/ui/Separator';
import { Switch } from '~/components/ui/Switch';
import { EVENT_LABELS, EVENT_TYPES, type EventType } from '~/lib/notify/types';
import { cn } from '~/lib/utils';
import { api } from '~/trpc/react';

const ICONS: Record<EventType, React.ReactNode> = {
    device_created: <Cpu className="size-4" />,
    location_created: <MapPin className="size-4" />,
    loudness_alert: <AlertTriangle className="size-4" />,
    reading_created: <Activity className="size-4" />,
    recording_created: <Mic className="size-4" />,
};

const DESCRIPTIONS: Record<EventType, string> = {
    device_created: 'When a new device is registered.',
    location_created: 'When a new location is created.',
    loudness_alert: 'When a reading exceeds the device loudness threshold.',
    reading_created: 'When any sensor reading is recorded.',
    recording_created: 'When a new audio recording is uploaded.',
};

export function SubscriptionsPanel() {
    const utils = api.useUtils();
    const prefs = api.notification.getMyPrefs.useQuery();
    const setPref = api.notification.setPref.useMutation({
        onError: (err) => toast.error(err.message),
        onSuccess: async () => {
            await utils.notification.getMyPrefs.invalidate();
        },
    });

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Bell className="size-4" />
                    Email subscriptions
                </CardTitle>
            </CardHeader>
            <Separator />
            <CardContent className="flex flex-col gap-1.5">
                {prefs.isLoading && (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                        Loading…
                    </p>
                )}
                {!prefs.isLoading &&
                    EVENT_TYPES.map((eventType) => {
                        const enabled = prefs.data?.[eventType] ?? false;
                        return (
                            <div
                                className={cn(
                                    'flex items-center gap-3 rounded-lg border border-border/60 bg-background p-3',
                                )}
                                key={eventType}
                            >
                                <div className="rounded-md bg-white/5 p-2 text-muted-foreground">
                                    {ICONS[eventType]}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-white">
                                        {EVENT_LABELS[eventType]}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {DESCRIPTIONS[eventType]}
                                    </p>
                                </div>
                                <Switch
                                    checked={enabled}
                                    disabled={setPref.isPending}
                                    onCheckedChange={(v) =>
                                        setPref.mutate({
                                            enabled: v,
                                            eventType,
                                        })
                                    }
                                />
                            </div>
                        );
                    })}
            </CardContent>
        </Card>
    );
}
