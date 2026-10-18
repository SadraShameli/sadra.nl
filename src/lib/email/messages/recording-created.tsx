import type { ReactElement } from 'react';

import { Heading, Text } from '@react-email/components';

import {
    NotificationEmail,
    notificationSettingsUrl,
} from '~/lib/email/NotificationEmail';
import { BaseEmail } from '~/lib/email/templates/base';

interface RecordingCreatedTemplateProperties {
    deviceName?: string;
    durationSeconds: null | number | undefined;
    fileName: string;
    locationName?: string;
}

export class RecordingCreatedEmail extends NotificationEmail {
    readonly subject = 'New recording';
    readonly to: string;

    constructor(
        to: string,
        private readonly parameters: RecordingCreatedTemplateProperties,
    ) {
        super();
        this.to = to;
    }

    protected content(): ReactElement {
        return <RecordingCreatedTemplate {...this.parameters} />;
    }
}

function formatDuration(seconds: null | number | undefined): string {
    return seconds == null ? '' : ` (${Math.round(seconds)}s)`;
}

function RecordingCreatedTemplate({
    deviceName = '-',
    durationSeconds,
    fileName,
    locationName = '-',
}: RecordingCreatedTemplateProperties) {
    return (
        <BaseEmail
            notificationSettingsUrl={notificationSettingsUrl()}
            preview={`New recording: ${fileName}`}
        >
            <Heading className="m-0 mb-4 font-serif text-3xl font-medium text-ink">
                New recording
            </Heading>
            <Text className="mt-4 mb-0.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                File
            </Text>
            <Text className="m-0 text-sm/snug text-ink-soft">
                {fileName}
                {formatDuration(durationSeconds)}
            </Text>
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
        </BaseEmail>
    );
}
