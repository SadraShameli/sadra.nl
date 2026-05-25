import { Heading, Text } from '@react-email/components';
import { render } from '@react-email/render';

import { EmailMessage } from '../message';
import { BaseEmail } from '../templates/base';

interface DeviceCreatedTemplateProps {
    deviceId: number;
    deviceName: string;
    locationName: null | string;
}

export class DeviceCreatedEmail extends EmailMessage {
    readonly subject = 'New device — sadra.nl';
    readonly to: string;

    constructor(
        to: string,
        private readonly params: DeviceCreatedTemplateProps,
    ) {
        super();
        this.to = to;
    }

    async render(): Promise<string> {
        return render(<DeviceCreatedTemplate {...this.params} />);
    }
}

function DeviceCreatedTemplate({
    deviceId,
    deviceName,
    locationName,
}: DeviceCreatedTemplateProps) {
    return (
        <BaseEmail preview={`New device registered: ${deviceName}`}>
            <Heading className="m-0 mb-4 text-xl font-semibold text-neutral-900">
                New device registered
            </Heading>
            <Text className="mt-4 mb-0.5 text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
                Name
            </Text>
            <Text className="m-0 text-sm leading-snug text-neutral-700">
                {deviceName}
            </Text>
            <Text className="mt-4 mb-0.5 text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
                Device ID
            </Text>
            <Text className="m-0 text-sm leading-snug text-neutral-700">
                {deviceId}
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
