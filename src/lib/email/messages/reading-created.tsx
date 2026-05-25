import { Heading, Text } from '@react-email/components';
import { render } from '@react-email/render';

import { EmailMessage } from '../message';
import { BaseEmail } from '../templates/base';

interface ReadingCreatedTemplateProps {
    deviceName: null | string;
    locationName: null | string;
    sensorReadings: SensorReading[];
}

interface SensorReading {
    name: string;
    unit: null | string;
    value: number;
}

export class ReadingCreatedEmail extends EmailMessage {
    readonly subject = 'New reading — sadra.nl';
    readonly to: string;

    constructor(
        to: string,
        private readonly params: ReadingCreatedTemplateProps,
    ) {
        super();
        this.to = to;
    }

    async render(): Promise<string> {
        return render(<ReadingCreatedTemplate {...this.params} />);
    }
}

function ReadingCreatedTemplate({
    deviceName,
    locationName,
    sensorReadings,
}: ReadingCreatedTemplateProps) {
    return (
        <BaseEmail preview="New sensor reading received">
            <Heading className="m-0 mb-4 text-xl font-semibold text-neutral-900">
                New sensor reading
            </Heading>
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
            <Text className="mt-4 mb-2 text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
                Readings
            </Text>
            {sensorReadings.map((r) => (
                <Text
                    className="m-0 border-b border-neutral-100 py-1.5 text-sm leading-snug text-neutral-700"
                    key={r.name}
                >
                    <span className="text-neutral-500">{r.name}: </span>
                    {r.value}
                    {r.unit ? ` ${r.unit}` : ''}
                </Text>
            ))}
        </BaseEmail>
    );
}
