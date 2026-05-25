import { Button, Heading, Text } from '@react-email/components';
import { render } from '@react-email/render';

import { EmailMessage } from '../message';
import { BaseEmail } from '../templates/base';

export class PasswordResetEmail extends EmailMessage {
    readonly subject = 'Reset your password — sadra.nl';
    readonly to: string;

    constructor(
        to: string,
        private readonly url: string,
    ) {
        super();
        this.to = to;
    }

    async render(): Promise<string> {
        return render(<PasswordResetTemplate url={this.url} />);
    }
}

function PasswordResetTemplate({ url }: { url: string }) {
    return (
        <BaseEmail preview="Reset your password on sadra.nl">
            <Heading className="m-0 mb-4 text-xl font-semibold text-neutral-900">
                Reset your password
            </Heading>
            <Text className="mt-0 mb-6 text-sm leading-6 text-neutral-600">
                Click the button below to reset your password. This link expires
                in 1 hour.
            </Text>
            <Button
                className="block rounded-md bg-neutral-900 px-6 py-3 text-center text-sm font-semibold text-white no-underline"
                href={url}
            >
                Reset password
            </Button>
            <Text className="mt-5 mb-0 text-xs text-neutral-400">
                If you didn't request this, you can safely ignore this email.
            </Text>
        </BaseEmail>
    );
}
