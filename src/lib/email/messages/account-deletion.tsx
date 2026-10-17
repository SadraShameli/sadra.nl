import type { ReactElement } from 'react';

import { Button, Heading, Text } from '@react-email/components';

import { EmailLink, emailLinkLifetimeText } from '~/lib/auth/EmailLink';
import { EmailMessage } from '~/lib/email/message';
import { BaseEmail } from '~/lib/email/templates/base';

export class AccountDeletionEmail extends EmailMessage {
    readonly subject = 'Confirm deleting your sadra.nl account';
    readonly to: string;

    constructor(
        to: string,
        private readonly url: string,
    ) {
        super();
        this.to = to;
    }

    protected content(): ReactElement {
        return <AccountDeletionTemplate url={this.url} />;
    }
}

function AccountDeletionTemplate({ url }: { url: string }) {
    return (
        <BaseEmail preview="Confirm deleting your sadra.nl account">
            <Heading className="m-0 mb-4 font-serif text-3xl font-medium text-ink">
                Delete your account
            </Heading>
            <Text className="mt-0 mb-6 text-sm/6 text-ink-soft">
                {`Click the button below to permanently delete your account and all of its data. Open it in the browser where you are signed in. This link expires in ${emailLinkLifetimeText(EmailLink.AccountDeletion)}.`}
            </Text>
            <Button
                className="block rounded-full bg-danger px-6 py-3 text-center text-sm font-semibold text-on-camel no-underline"
                href={url}
            >
                Delete my account
            </Button>
            <Text className="mt-5 mb-0 text-xs text-ink-muted">
                If you didn't ask for this, ignore this email and change your
                password; your account stays as it is.
            </Text>
        </BaseEmail>
    );
}
