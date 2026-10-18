import type { ReactElement } from 'react';

import { Heading, Text } from '@react-email/components';

import {
    NotificationEmail,
    notificationSettingsUrl,
} from '~/lib/email/NotificationEmail';
import { BaseEmail } from '~/lib/email/templates/base';

interface ReadingCreatedTemplateProperties {
    deviceName?: string;
    locationName?: string;
    sensorReadings: SensorReading[];
}

interface SensorReading {
    name: string;
    unit: null | string;
    value: number;
}

export class ReadingCreatedEmail extends NotificationEmail {
    readonly subject = 'New reading';
    readonly to: string;

    constructor(
        to: string,
        private readonly parameters: ReadingCreatedTemplateProperties,
    ) {
        super();
        this.to = to;
    }

    protected content(): ReactElement {
        return <ReadingCreatedTemplate {...this.parameters} />;
    }
}

function ReadingCreatedTemplate({
    deviceName = '-',
    locationName = '-',
    sensorReadings,
}: ReadingCreatedTemplateProperties) {
    return (
        <BaseEmail
            notificationSettingsUrl={notificationSettingsUrl()}
            preview="New sensor reading received"
        >
            <Heading className="m-0 mb-4 font-serif text-3xl font-medium text-ink">
                New sensor reading
            </Heading>
            <Text className="mt-4 mb-0.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                Device
            </Text>
            <Text className="m-0 text-sm/snug text-ink-soft">{deviceName}</Text>
            <Text className="mt-4 mb-0.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                Location
            </Text>
            <Text className="m-0 text-sm/snug text-ink-soft">
                {locationName}
            </Text>
            <Text className="mt-4 mb-2 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                Readings
            </Text>
            {sensorReadings.map((r) => (
                <Text
                    className="m-0 border-b border-line-faint py-1.5 text-sm/snug text-ink-soft"
                    key={r.name}
                >
                    <span className="text-ink-muted">{r.name}: </span>
                    {r.value}
                    {r.unit ? ` ${r.unit}` : ''}
                </Text>
            ))}
        </BaseEmail>
    );
}
