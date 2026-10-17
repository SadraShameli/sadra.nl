import type { ReactElement } from 'react';

import { Button, Heading, Text } from '@react-email/components';

import { EmailMessage } from '~/lib/email/message';
import { BaseEmail } from '~/lib/email/templates/base';

export class PasswordResetEmail extends EmailMessage {
    readonly subject = 'Reset your password';
    readonly to: string;

    constructor(
        to: string,
        private readonly url: string,
    ) {
        super();
        this.to = to;
    }

    protected content(): ReactElement {
        return <PasswordResetTemplate url={this.url} />;
    }
}

function PasswordResetTemplate({ url }: { url: string }) {
    return (
        <BaseEmail preview="Reset your password on sadra.nl">
            <Heading className="m-0 mb-4 font-serif text-3xl font-medium text-ink">
                Reset your password
            </Heading>
            <Text className="mt-0 mb-6 text-sm/6 text-ink-soft">
                Click the button below to reset your password. This link expires
                in 1 hour.
            </Text>
            <Button
                className="block rounded-full bg-camel px-6 py-3 text-center text-sm font-semibold text-on-camel no-underline"
                href={url}
            >
                Reset password
            </Button>
            <Text className="mt-5 mb-0 text-xs text-ink-muted">
                If you didn't request this, you can safely ignore this email.
            </Text>
        </BaseEmail>
    );
}
