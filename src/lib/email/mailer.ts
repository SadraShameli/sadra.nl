import type { EmailMessage } from './message';
import type { EmailProvider } from './provider';

const rawSender = process.env.EMAIL_FROM;
const configuredSender = rawSender?.trim();
const EMAIL_FROM =
    configuredSender === undefined || configuredSender === ''
        ? 'noreply@sadra.nl'
        : configuredSender;

export class Mailer {
    constructor(private readonly provider: EmailProvider) {}

    async send(message: EmailMessage): Promise<void> {
        const [html, text] = await Promise.all([
            message.render(),
            message.renderText(),
        ]);
        await this.provider.send({
            from: EMAIL_FROM,
            headers: message.headers(),
            html,
            subject: message.subject,
            text,
            to: message.to,
        });
    }
}
