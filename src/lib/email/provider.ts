import { Lettermint } from 'lettermint';
import { Resend } from 'resend';

import { captureError } from '~/lib/observability/logger';

export interface EmailSendArgs {
    from: string;
    html: string;
    subject: string;
    to: string;
}

export abstract class EmailProvider {
    abstract send(args: EmailSendArgs): Promise<void>;
}

export class FallbackEmailProvider extends EmailProvider {
    constructor(
        private readonly primary: EmailProvider,
        private readonly fallback: EmailProvider,
    ) {
        super();
    }

    override async send(args: EmailSendArgs): Promise<void> {
        try {
            await this.primary.send(args);
        } catch (primaryError) {
            try {
                await this.fallback.send(args);
            } catch (fallbackError) {
                captureError(primaryError, {
                    fields: { subject: args.subject, to: args.to },
                    tag: 'email.primary',
                });
                captureError(fallbackError, {
                    fields: { subject: args.subject, to: args.to },
                    tag: 'email.fallback',
                });
                throw fallbackError;
            }
        }
    }
}

export class LettermintProvider extends EmailProvider {
    private readonly client: ReturnType<typeof Lettermint.email>;

    constructor(token: string) {
        super();
        this.client = Lettermint.email(token);
    }

    override async send(args: EmailSendArgs): Promise<void> {
        await this.client
            .from(args.from)
            .to(args.to)
            .subject(args.subject)
            .html(args.html)
            .send();
    }
}

export class ResendProvider extends EmailProvider {
    private readonly client: Resend;

    constructor(apiKey: string) {
        super();
        this.client = new Resend(apiKey);
    }

    override async send(args: EmailSendArgs): Promise<void> {
        await this.client.emails.send({
            from: args.from,
            html: args.html,
            subject: args.subject,
            to: args.to,
        });
    }
}
