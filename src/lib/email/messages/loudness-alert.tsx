import { Heading, Text } from '@react-email/components';

import { EmailMessage } from '../message';
import { renderEmailToHtml } from '../render';
import { BaseEmail } from '../templates/base';

interface LoudnessAlertTemplateProps {
    deviceName: null | string;
    locationName: null | string;
    threshold: number;
    value: number;
}

export class LoudnessAlertEmail extends EmailMessage {
    readonly subject = 'Loudness alert — sadra.nl';
    readonly to: string;

    constructor(
        to: string,
        private readonly params: LoudnessAlertTemplateProps,
    ) {
        super();
        this.to = to;
    }

    async render(): Promise<string> {
        return renderEmailToHtml(<LoudnessAlertTemplate {...this.params} />);
    }
}

function LoudnessAlertTemplate({
    deviceName,
    locationName,
    threshold,
    value,
}: LoudnessAlertTemplateProps) {
    return (
        <BaseEmail
            preview={`Loudness alert: ${value} exceeded threshold ${threshold}`}
        >
            <Heading className="m-0 mb-4 text-xl font-semibold text-neutral-900">
                Loudness threshold exceeded
            </Heading>
            <Text className="mt-0 mb-5 inline-block rounded bg-rose-50 px-2.5 py-1 text-sm font-semibold text-rose-600">
                ⚠ Alert
            </Text>
            <Text className="mt-4 mb-0.5 text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
                Measured value
            </Text>
            <Text className="m-0 text-sm leading-snug font-semibold text-rose-600">
                {value}
            </Text>
            <Text className="mt-4 mb-0.5 text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
                Threshold
            </Text>
            <Text className="m-0 text-sm leading-snug text-neutral-700">
                {threshold}
            </Text>
            <Text className="mt-4 mb-0.5 text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
                Device
            </Text>
            <Text className="m-0 text-sm leading-snug text-neutral-700">
                {deviceName ?? '—'}
            </Text>
            <Text className="mt-4 mb-0.5 text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
                Location
            </Text>
            <Text className="m-0 text-sm leading-snug text-neutral-700">
                {locationName ?? '—'}
            </Text>
        </BaseEmail>
    );
}
