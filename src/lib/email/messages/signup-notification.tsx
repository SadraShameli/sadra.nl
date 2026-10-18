import type { ReactElement } from 'react';

import { Heading, Text } from '@react-email/components';

import { EmailMessage } from '~/lib/email/message';
import { BaseEmail } from '~/lib/email/templates/base';

interface SignUpNotificationTemplateProperties {
    email: string;
    name: null | string | undefined;
}

export class SignUpNotificationEmail extends EmailMessage {
    readonly subject = 'New sign-up';
    readonly to: string;

    constructor(
        to: string,
        private readonly email: string,
        private readonly name: null | string | undefined,
    ) {
        super();
        this.to = to;
    }

    protected content(): ReactElement {
        return (
            <SignUpNotificationTemplate email={this.email} name={this.name} />
        );
    }
}

function SignUpNotificationTemplate({
    email,
    name,
}: SignUpNotificationTemplateProperties) {
    return (
        <BaseEmail preview={`New sign-up: ${email}`}>
            <Heading className="m-0 mb-4 font-serif text-3xl font-medium text-ink">
                New sign-up
            </Heading>
            <Text className="mt-4 mb-0.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                Email
            </Text>
            <Text className="m-0 text-sm/snug text-ink-soft">{email}</Text>
            {name && (
                <>
                    <Text className="mt-4 mb-0.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                        Name
                    </Text>
                    <Text className="m-0 text-sm/snug text-ink-soft">
                        {name}
                    </Text>
                </>
            )}
        </BaseEmail>
    );
}
