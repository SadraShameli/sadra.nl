import type { EmailMessage } from './message';
import type { EmailProvider } from './provider';

const EMAIL_FROM = 'noreply@sadra.nl';

export class Mailer {
    constructor(private readonly provider: EmailProvider) {}

    async send(message: EmailMessage): Promise<void> {
        const html = await message.render();
        await this.provider.send({
            from: EMAIL_FROM,
            html,
            subject: message.subject,
            to: message.to,
        });
    }
}
