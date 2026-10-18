import type { ReactElement } from 'react';

import { Heading, Text } from '@react-email/components';

import {
    NotificationEmail,
    notificationSettingsUrl,
} from '~/lib/email/NotificationEmail';
import { BaseEmail } from '~/lib/email/templates/base';

interface DeviceCreatedTemplateProperties {
    deviceId: number;
    deviceName: string;
    locationName?: string;
}

export class DeviceCreatedEmail extends NotificationEmail {
    readonly subject = 'New device';
    readonly to: string;

    constructor(
        to: string,
        private readonly parameters: DeviceCreatedTemplateProperties,
    ) {
        super();
        this.to = to;
    }

    protected content(): ReactElement {
        return <DeviceCreatedTemplate {...this.parameters} />;
    }
}

function DeviceCreatedTemplate({
    deviceId,
    deviceName,
    locationName = '-',
}: DeviceCreatedTemplateProperties) {
    return (
        <BaseEmail
            notificationSettingsUrl={notificationSettingsUrl()}
            preview={`New device registered: ${deviceName}`}
        >
            <Heading className="m-0 mb-4 font-serif text-3xl font-medium text-ink">
                New device registered
            </Heading>
            <Text className="mt-4 mb-0.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                Name
            </Text>
            <Text className="m-0 text-sm/snug text-ink-soft">{deviceName}</Text>
            <Text className="mt-4 mb-0.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                Device ID
            </Text>
            <Text className="m-0 text-sm/snug text-ink-soft">{deviceId}</Text>
            <Text className="mt-4 mb-0.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                Location
            </Text>
            <Text className="m-0 text-sm/snug text-ink-soft">
                {locationName}
            </Text>
        </BaseEmail>
    );
}
