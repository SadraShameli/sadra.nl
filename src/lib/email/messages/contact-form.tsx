import { Heading, Hr, Text } from '@react-email/components';
import { render } from '@react-email/render';

import { EmailMessage } from '../message';
import { BaseEmail } from '../templates/base';

interface ContactFormTemplateProperties {
    email: string;
    ip: string;
    message: string;
    name: string;
}

export class ContactFormEmail extends EmailMessage {
    readonly to: string;

    get subject(): string {
        return `Contact form — ${this.name}`;
    }

    constructor(
        to: string,
        private readonly name: string,
        private readonly senderEmail: string,
        private readonly ip: string,
        private readonly message: string,
    ) {
        super();
        this.to = to;
    }

    async render(): Promise<string> {
        return render(
            <ContactFormTemplate
                email={this.senderEmail}
                ip={this.ip}
                message={this.message}
                name={this.name}
            />,
        );
    }
}

function ContactFormTemplate({
    email,
    ip,
    message,
    name,
}: ContactFormTemplateProperties) {
    return (
        <BaseEmail preview={`Contact from ${name}`}>
            <Heading className="m-0 mb-4 text-xl font-semibold text-neutral-900">
                New message
            </Heading>
            <Text className="mt-4 mb-0.5 text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
                From
            </Text>
            <Text className="m-0 text-sm leading-snug text-neutral-700">
                {name} &lt;{email}&gt;
            </Text>
            <Text className="mt-4 mb-0.5 text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
                IP
            </Text>
            <Text className="m-0 text-sm leading-snug text-neutral-700">
                {ip}
            </Text>
            <Hr className="my-5 border-neutral-200" />
            <Text className="mt-0 mb-0.5 text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
                Message
            </Text>
            <Text className="m-0 text-sm leading-6 whitespace-pre-wrap text-neutral-700">
                {message}
            </Text>
        </BaseEmail>
    );
}
