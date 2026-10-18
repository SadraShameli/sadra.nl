import type { ReactElement } from 'react';

import { Button, Heading, Text } from '@react-email/components';

import { EmailLink, emailLinkLifetimeText } from '~/lib/auth/EmailLink';
import { EmailMessage } from '~/lib/email/message';
import { BaseEmail } from '~/lib/email/templates/base';

export class MagicLinkEmail extends EmailMessage {
    readonly subject = 'Sign in to sadra.nl';
    readonly to: string;

    constructor(
        to: string,
        private readonly url: string,
    ) {
        super();
        this.to = to;
    }

    protected content(): ReactElement {
        return <MagicLinkTemplate url={this.url} />;
    }
}

function MagicLinkTemplate({ url }: { url: string }) {
    return (
        <BaseEmail preview="Your sign-in link for sadra.nl">
            <Heading className="m-0 mb-4 font-serif text-3xl font-medium text-ink">
                Sign in to sadra.nl
            </Heading>
            <Text className="mt-0 mb-6 text-sm/6 text-ink-soft">
                {`Click the button below to sign in. This link expires in ${emailLinkLifetimeText(EmailLink.SignIn)}.`}
            </Text>
            <Button
                className="block rounded-full selected-pill px-6 py-3 text-center text-sm font-semibold no-underline"
                href={url}
            >
                Sign in
            </Button>
            <Text className="mt-5 mb-0 text-xs text-ink-muted">
                If you didn't request this, you can safely ignore this email.
            </Text>
        </BaseEmail>
    );
}
