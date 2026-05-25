import { Heading, Text } from '@react-email/components';
import { render } from '@react-email/render';

import { EmailMessage } from '../message';
import { BaseEmail } from '../templates/base';

interface SignUpNotificationTemplateProps {
    email: string;
    name: null | string | undefined;
}

export class SignUpNotificationEmail extends EmailMessage {
    readonly subject = 'New sign-up — sadra.nl';
    readonly to: string;

    constructor(
        to: string,
        private readonly email: string,
        private readonly name: null | string | undefined,
    ) {
        super();
        this.to = to;
    }

    async render(): Promise<string> {
        return render(
            <SignUpNotificationTemplate email={this.email} name={this.name} />,
        );
    }
}

function SignUpNotificationTemplate({
    email,
    name,
}: SignUpNotificationTemplateProps) {
    return (
        <BaseEmail preview={`New sign-up: ${email}`}>
            <Heading className="m-0 mb-4 text-xl font-semibold text-neutral-900">
                New sign-up
            </Heading>
            <Text className="mt-4 mb-0.5 text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
                Email
            </Text>
            <Text className="m-0 text-sm leading-snug text-neutral-700">
                {email}
            </Text>
            {name && (
                <>
                    <Text className="mt-4 mb-0.5 text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
                        Name
                    </Text>
                    <Text className="m-0 text-sm leading-snug text-neutral-700">
                        {name}
                    </Text>
                </>
            )}
        </BaseEmail>
    );
}
