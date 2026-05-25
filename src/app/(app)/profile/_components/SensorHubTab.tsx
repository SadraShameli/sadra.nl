'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/Tabs';
import { cn } from '~/lib/utils';

import { DevicesPanel } from './sensor-hub/DevicesPanel';
import { LocationsPanel } from './sensor-hub/LocationsPanel';
import { ReadingsPanel } from './sensor-hub/ReadingsPanel';
import { RecordingsPanel } from './sensor-hub/RecordingsPanel';
import { SensorsPanel } from './sensor-hub/SensorsPanel';
import { SubscriptionsPanel } from './sensor-hub/SubscriptionsPanel';

export function SensorHubTab() {
    return (
        <Tabs
            className={cn('app-profile__sensor-hub', 'flex flex-col gap-4')}
            defaultValue="locations"
        >
            <TabsList className="grid h-auto w-full grid-cols-3 gap-1 md:grid-cols-6">
                <TabsTrigger value="locations">Locations</TabsTrigger>
                <TabsTrigger value="devices">Devices</TabsTrigger>
                <TabsTrigger value="sensors">Sensors</TabsTrigger>
                <TabsTrigger value="readings">Readings</TabsTrigger>
                <TabsTrigger value="recordings">Recordings</TabsTrigger>
                <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
            </TabsList>
            <TabsContent value="locations">
                <LocationsPanel />
            </TabsContent>
            <TabsContent value="devices">
                <DevicesPanel />
            </TabsContent>
            <TabsContent value="sensors">
                <SensorsPanel />
            </TabsContent>
            <TabsContent value="readings">
                <ReadingsPanel />
            </TabsContent>
            <TabsContent value="recordings">
                <RecordingsPanel />
            </TabsContent>
            <TabsContent value="subscriptions">
                <SubscriptionsPanel />
            </TabsContent>
        </Tabs>
    );
}
