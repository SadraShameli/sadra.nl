import { Button, Heading, Text } from '@react-email/components';
import { render } from '@react-email/render';

import { EmailMessage } from '../message';
import { BaseEmail } from '../templates/base';

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

    async render(): Promise<string> {
        return render(<MagicLinkTemplate url={this.url} />);
    }
}

function MagicLinkTemplate({ url }: { url: string }) {
    return (
        <BaseEmail preview="Your sign-in link for sadra.nl">
            <Heading className="m-0 mb-4 text-xl font-semibold text-neutral-900">
                Sign in to sadra.nl
            </Heading>
            <Text className="mt-0 mb-6 text-sm leading-6 text-neutral-600">
                Click the button below to sign in. This link expires in 24
                hours.
            </Text>
            <Button
                className="block rounded-md bg-neutral-900 px-6 py-3 text-center text-sm font-semibold text-white no-underline"
                href={url}
            >
                Sign in
            </Button>
            <Text className="mt-5 mb-0 text-xs text-neutral-400">
                If you didn't request this, you can safely ignore this email.
            </Text>
        </BaseEmail>
    );
}
