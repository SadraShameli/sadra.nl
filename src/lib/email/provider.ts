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
    abstract send(arguments_: EmailSendArgs): Promise<void>;
}

export class FallbackEmailProvider extends EmailProvider {
    constructor(
        private readonly primary: EmailProvider,
        private readonly fallback: EmailProvider,
    ) {
        super();
    }

    override async send(arguments_: EmailSendArgs): Promise<void> {
        try {
            await this.primary.send(arguments_);
        } catch (primaryError) {
            try {
                await this.fallback.send(arguments_);
            } catch (fallbackError) {
                captureError(primaryError, {
                    fields: { subject: arguments_.subject, to: arguments_.to },
                    tag: 'email.primary',
                });
                captureError(fallbackError, {
                    fields: { subject: arguments_.subject, to: arguments_.to },
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

    override async send(arguments_: EmailSendArgs): Promise<void> {
        await this.client
            .from(arguments_.from)
            .to(arguments_.to)
            .subject(arguments_.subject)
            .html(arguments_.html)
            .send();
    }
}

export class ResendProvider extends EmailProvider {
    private readonly client: Resend;

    constructor(apiKey: string) {
        super();
        this.client = new Resend(apiKey);
    }

    override async send(arguments_: EmailSendArgs): Promise<void> {
        await this.client.emails.send({
            from: arguments_.from,
            html: arguments_.html,
            subject: arguments_.subject,
            to: arguments_.to,
        });
    }
}
