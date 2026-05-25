import { Heading, Text } from '@react-email/components';

import { EmailMessage } from '../message';
import { renderEmailToHtml } from '../render';
import { BaseEmail } from '../templates/base';

interface RecordingCreatedTemplateProps {
    deviceName: null | string;
    durationSeconds: null | number | undefined;
    fileName: string;
    locationName: null | string;
}

export class RecordingCreatedEmail extends EmailMessage {
    readonly subject = 'New recording — sadra.nl';
    readonly to: string;

    constructor(
        to: string,
        private readonly params: RecordingCreatedTemplateProps,
    ) {
        super();
        this.to = to;
    }

    async render(): Promise<string> {
        return renderEmailToHtml(<RecordingCreatedTemplate {...this.params} />);
    }
}

function formatDuration(seconds: null | number | undefined): string {
    if (seconds == null) return '';
    return ` (${Math.round(seconds)}s)`;
}

function RecordingCreatedTemplate({
    deviceName,
    durationSeconds,
    fileName,
    locationName,
}: RecordingCreatedTemplateProps) {
    return (
        <BaseEmail preview={`New recording: ${fileName}`}>
            <Heading className="m-0 mb-4 text-xl font-semibold text-neutral-900">
                New recording
            </Heading>
            <Text className="mt-4 mb-0.5 text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
                File
            </Text>
            <Text className="m-0 text-sm leading-snug text-neutral-700">
                {fileName}
                {formatDuration(durationSeconds)}
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
