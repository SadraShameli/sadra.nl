import type { ReactElement } from 'react';

import { Button, Heading, Text } from '@react-email/components';

import { EmailLink, emailLinkLifetimeText } from '~/lib/auth/EmailLink';
import { EmailMessage } from '~/lib/email/message';
import { BaseEmail } from '~/lib/email/templates/base';

export class EmailChangeConfirmationEmail extends EmailMessage {
    readonly subject = 'Confirm your new sadra.nl email address';
    readonly to: string;

    constructor(
        to: string,
        private readonly newEmail: string,
        private readonly url: string,
    ) {
        super();
        this.to = to;
    }

    protected content(): ReactElement {
        return (
            <EmailChangeConfirmationTemplate
                newEmail={this.newEmail}
                url={this.url}
            />
        );
    }
}

function EmailChangeConfirmationTemplate({
    newEmail,
    url,
}: {
    newEmail: string;
    url: string;
}) {
    return (
        <BaseEmail preview="Approve the email change on your sadra.nl account">
            <Heading className="m-0 mb-4 font-serif text-3xl font-medium text-ink">
                Approve your email change
            </Heading>
            <Text className="mt-0 mb-6 text-sm/6 text-ink-soft">
                {`Someone signed in to your account asked to change its email address to ${newEmail}. Click the button below to approve it; we then send a verification link to the new address. This link expires in ${emailLinkLifetimeText(EmailLink.Verification)}.`}
            </Text>
            <Button
                className="block rounded-full selected-pill px-6 py-3 text-center text-sm font-semibold no-underline"
                href={url}
            >
                Approve change
            </Button>
            <Text className="mt-5 mb-0 text-xs text-ink-muted">
                If this wasn't you, don't click the link and change your
                password right away.
            </Text>
        </BaseEmail>
    );
}
