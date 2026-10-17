import { Lettermint } from 'lettermint';
import { Resend } from 'resend';

import { captureError } from '~/lib/observability/logger';

export interface EmailSendArguments {
    from: string;
    html: string;
    subject: string;
    to: string;
}

class ResendRejectionError extends Error {
    constructor(reason: string) {
        super(`Resend rejected the message: ${reason}`);
        this.name = 'ResendRejectionError';
    }
}

export abstract class EmailProvider {
    abstract send(arguments_: EmailSendArguments): Promise<void>;
}

export class FallbackEmailProvider extends EmailProvider {
    constructor(
        private readonly primary: EmailProvider,
        private readonly fallback: EmailProvider,
    ) {
        super();
    }

    override async send(arguments_: EmailSendArguments): Promise<void> {
        try {
            await this.primary.send(arguments_);
        } catch (primaryError) {
            captureError(primaryError, {
                fields: { subject: arguments_.subject },
                tag: 'email.primary',
            });
            try {
                await this.fallback.send(arguments_);
            } catch (fallbackError) {
                captureError(fallbackError, {
                    fields: { subject: arguments_.subject },
                    tag: 'email.fallback',
                });
                throw fallbackError;
            }
        }
    }
}

export class LettermintProvider extends EmailProvider {
    constructor(private readonly token: string) {
        super();
    }

    override async send(arguments_: EmailSendArguments): Promise<void> {
        const client = new Lettermint({ sendingToken: this.token });
        await client.emails.send({
            from: arguments_.from,
            html: arguments_.html,
            subject: arguments_.subject,
            to: [arguments_.to],
        });
    }
}

export class ResendProvider extends EmailProvider {
    private readonly client: Resend;

    constructor(apiKey: string) {
        super();
        this.client = new Resend(apiKey);
    }

    override async send(arguments_: EmailSendArguments): Promise<void> {
        const { error } = await this.client.emails.send({
            from: arguments_.from,
            html: arguments_.html,
            subject: arguments_.subject,
            to: arguments_.to,
        });
        if (error !== null) throw new ResendRejectionError(error.message);
    }
}
