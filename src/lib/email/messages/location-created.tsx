import type { ReactElement } from 'react';

import { Heading, Text } from '@react-email/components';

import {
    NotificationEmail,
    notificationSettingsUrl,
} from '~/lib/email/NotificationEmail';
import { BaseEmail } from '~/lib/email/templates/base';

interface LocationCreatedTemplateProperties {
    locationId: number;
    locationName: string;
}

export class LocationCreatedEmail extends NotificationEmail {
    readonly subject = 'New location';
    readonly to: string;

    constructor(
        to: string,
        private readonly parameters: LocationCreatedTemplateProperties,
    ) {
        super();
        this.to = to;
    }

    protected content(): ReactElement {
        return <LocationCreatedTemplate {...this.parameters} />;
    }
}

function LocationCreatedTemplate({
    locationId,
    locationName,
}: LocationCreatedTemplateProperties) {
    return (
        <BaseEmail
            notificationSettingsUrl={notificationSettingsUrl()}
            preview={`New location created: ${locationName}`}
        >
            <Heading className="m-0 mb-4 font-serif text-3xl font-medium text-ink">
                New location created
            </Heading>
            <Text className="mt-4 mb-0.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                Name
            </Text>
            <Text className="m-0 text-sm/snug text-ink-soft">
                {locationName}
            </Text>
            <Text className="mt-4 mb-0.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                ID
            </Text>
            <Text className="m-0 text-sm/snug text-ink-soft">{locationId}</Text>
        </BaseEmail>
    );
}
