import { afterEach, describe, expect, it, vi } from 'vitest';

import { Mailer } from '~/lib/email/mailer';
import { DeviceCreatedEmail } from '~/lib/email/messages/device-created';
import { PasswordResetEmail } from '~/lib/email/messages/password-reset';
import { EmailProvider, type EmailSendArguments } from '~/lib/email/provider';

vi.mock('~/lib/observability/logger', () => ({ captureError: vi.fn() }));

const RESET_URL = 'https://sadra.nl/reset-password/abc123';

afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
});

class RecordingProvider extends EmailProvider {
    readonly sent: EmailSendArguments[] = [];

    override async send(arguments_: EmailSendArguments): Promise<void> {
        this.sent.push(arguments_);
    }
}

describe('Mailer', () => {
    it('uses a changed public domain and an independently configured sender', async () => {
        vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://trader.example');
        vi.stubEnv('EMAIL_FROM', 'notifications@mailer.example');
        vi.resetModules();
        const { Mailer: ConfiguredMailer } = await import('~/lib/email/mailer');
        const { PasswordResetEmail: ConfiguredPasswordResetEmail } =
            await import('~/lib/email/messages/password-reset');
        const provider = new RecordingProvider();

        await new ConfiguredMailer(provider).send(
            new ConfiguredPasswordResetEmail(
                'jane@example.com',
                'https://trader.example/reset-password/abc123',
            ),
        );

        const [sent] = provider.sent;
        expect(sent?.html).toContain('href="https://trader.example"');
        expect(sent?.html).not.toContain('sadra.nl');
        expect(sent?.from).toBe('notifications@mailer.example');
    });

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

    it('lets notification recipients unsubscribe from the email', async () => {
        const provider = new RecordingProvider();

        await new Mailer(provider).send(
            new DeviceCreatedEmail('jane@example.com', {
                deviceId: 7,
                deviceName: 'Garden Sensor',
                locationName: 'Garden',
            }),
        );

        const [sent] = provider.sent;
        expect(sent?.headers['List-Unsubscribe']).toMatch(
            /^<https?:\/\/[^>]+\/profile\?tab=sensor-hub>$/u,
        );
        expect(sent?.html).toContain('Manage notifications');
    });

    it('sends account emails without an unsubscribe header', async () => {
        const provider = new RecordingProvider();

        await new Mailer(provider).send(
            new PasswordResetEmail('jane@example.com', RESET_URL),
        );

        expect(provider.sent[0]?.headers).toEqual({});
    });
});
