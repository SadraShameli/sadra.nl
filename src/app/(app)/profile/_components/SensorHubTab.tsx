'use client';

import { type PageTab, PageTabs } from '~/components/PageTabs';

import { DevicesPanel } from './sensor-hub/DevicesPanel';
import { LocationsPanel } from './sensor-hub/LocationsPanel';
import { ReadingsPanel } from './sensor-hub/ReadingsPanel';
import { RecordingsPanel } from './sensor-hub/RecordingsPanel';
import { SensorsPanel } from './sensor-hub/SensorsPanel';
import { SubscriptionsPanel } from './sensor-hub/SubscriptionsPanel';

const SensorHubSection = {
    Devices: 'devices',
    Locations: 'locations',
    Readings: 'readings',
    Recordings: 'recordings',
    Sensors: 'sensors',
    Subscriptions: 'subscriptions',
} as const;

type SensorHubSection =
    (typeof SensorHubSection)[keyof typeof SensorHubSection];

const SENSOR_HUB_TABS: readonly PageTab<SensorHubSection>[] = [
    {
        content: <LocationsPanel />,
        label: 'Locations',
        value: SensorHubSection.Locations,
    },
    {
        content: <DevicesPanel />,
        label: 'Devices',
        value: SensorHubSection.Devices,
    },
    {
        content: <SensorsPanel />,
        label: 'Sensors',
        value: SensorHubSection.Sensors,
    },
    {
        content: <ReadingsPanel />,
        label: 'Readings',
        value: SensorHubSection.Readings,
    },
    {
        content: <RecordingsPanel />,
        label: 'Recordings',
        value: SensorHubSection.Recordings,
    },
    {
        content: <SubscriptionsPanel />,
        label: 'Subscriptions',
        value: SensorHubSection.Subscriptions,
    },
];

export function SensorHubTab() {
    return (
        <PageTabs
            className="app-profile__sensor-hub"
            defaultValue={SensorHubSection.Locations}
            tabs={SENSOR_HUB_TABS}
        />
    );
}
