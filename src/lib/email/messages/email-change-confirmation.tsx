import { Button, Heading, Text } from '@react-email/components';
import { render } from '@react-email/render';

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

    async render(): Promise<string> {
        return render(
            <EmailChangeConfirmationTemplate
                newEmail={this.newEmail}
                url={this.url}
            />,
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
            <Heading className="m-0 mb-4 text-xl font-semibold text-neutral-900">
                Approve your email change
            </Heading>
            <Text className="mt-0 mb-6 text-sm/6 text-neutral-600">
                {`Someone signed in to your account asked to change its email address to ${newEmail}. Click the button below to approve it; we then send a verification link to the new address. This link expires in ${emailLinkLifetimeText(EmailLink.Verification)}.`}
            </Text>
            <Button
                className="block rounded-md bg-neutral-900 px-6 py-3 text-center text-sm font-semibold text-white no-underline"
                href={url}
            >
                Approve change
            </Button>
            <Text className="mt-5 mb-0 text-xs text-neutral-400">
                If this wasn't you, don't click the link and change your
                password right away.
            </Text>
        </BaseEmail>
    );
}
