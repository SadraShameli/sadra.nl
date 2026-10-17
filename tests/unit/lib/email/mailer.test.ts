import { describe, expect, it, vi } from 'vitest';

import { Mailer } from '~/lib/email/mailer';
import { PasswordResetEmail } from '~/lib/email/messages/password-reset';
import { EmailProvider, type EmailSendArguments } from '~/lib/email/provider';

vi.mock('~/lib/observability/logger', () => ({ captureError: vi.fn() }));

const RESET_URL = 'https://sadra.nl/reset-password/abc123';

class RecordingProvider extends EmailProvider {
    readonly sent: EmailSendArguments[] = [];

    override async send(arguments_: EmailSendArguments): Promise<void> {
        this.sent.push(arguments_);
    }
}

describe('Mailer', () => {
    it('sends a plain-text part next to the HTML', async () => {
        const provider = new RecordingProvider();

        await new Mailer(provider).send(
            new PasswordResetEmail('jane@example.com', RESET_URL),
        );

        const [sent] = provider.sent;
        expect(sent?.html).toContain('<html');
        expect(sent?.text.toLowerCase()).toContain('reset your password');
        expect(sent?.text).toContain(RESET_URL);
        expect(sent?.text).not.toContain('<');
    });
});
