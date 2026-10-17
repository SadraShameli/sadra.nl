import type { ReactElement } from 'react';

import { Heading, Text } from '@react-email/components';

import {
    NotificationEmail,
    notificationSettingsUrl,
} from '~/lib/email/NotificationEmail';
import { BaseEmail } from '~/lib/email/templates/base';

interface LoudnessAlertTemplateProperties {
    deviceName?: string;
    locationName?: string;
    threshold: number;
    value: number;
}

export class LoudnessAlertEmail extends NotificationEmail {
    readonly subject = 'Loudness alert';
    readonly to: string;

    constructor(
        to: string,
        private readonly parameters: LoudnessAlertTemplateProperties,
    ) {
        super();
        this.to = to;
    }

    protected content(): ReactElement {
        return <LoudnessAlertTemplate {...this.parameters} />;
    }
}

function LoudnessAlertTemplate({
    deviceName = '-',
    locationName = '-',
    threshold,
    value,
}: LoudnessAlertTemplateProperties) {
    return (
        <BaseEmail
            notificationSettingsUrl={notificationSettingsUrl()}
            preview={`Loudness alert: ${value} exceeded threshold ${threshold}`}
        >
            <Heading className="m-0 mb-4 font-serif text-3xl font-medium text-ink">
                Loudness threshold exceeded
            </Heading>
            <Text className="mt-0 mb-5 inline-block rounded bg-surface-high px-2.5 py-1 text-sm font-semibold text-danger">
                ⚠ Alert
            </Text>
            <Text className="mt-4 mb-0.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                Measured value
            </Text>
            <Text className="m-0 text-sm/snug font-semibold text-danger">
                {value}
            </Text>
            <Text className="mt-4 mb-0.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                Threshold
            </Text>
            <Text className="m-0 text-sm/snug text-ink-soft">{threshold}</Text>
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
