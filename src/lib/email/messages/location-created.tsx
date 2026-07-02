import { Heading, Text } from '@react-email/components';
import { render } from '@react-email/render';

import { EmailMessage } from '../message';
import { BaseEmail } from '../templates/base';

interface LocationCreatedTemplateProperties {
    locationId: number;
    locationName: string;
}

export class LocationCreatedEmail extends EmailMessage {
    readonly subject = 'New location';
    readonly to: string;

    constructor(
        to: string,
        private readonly parameters: LocationCreatedTemplateProperties,
    ) {
        super();
        this.to = to;
    }

    async render(): Promise<string> {
        return render(<LocationCreatedTemplate {...this.parameters} />);
    }
}

function LocationCreatedTemplate({
    locationId,
    locationName,
}: LocationCreatedTemplateProperties) {
    return (
        <BaseEmail preview={`New location created: ${locationName}`}>
            <Heading className="m-0 mb-4 text-xl font-semibold text-neutral-900">
                New location created
            </Heading>
            <Text className="mt-4 mb-0.5 text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
                Name
            </Text>
            <Text className="m-0 text-sm leading-snug text-neutral-700">
                {locationName}
            </Text>
            <Text className="mt-4 mb-0.5 text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
                ID
            </Text>
            <Text className="m-0 text-sm leading-snug text-neutral-700">
                {locationId}
            </Text>
        </BaseEmail>
    );
}
