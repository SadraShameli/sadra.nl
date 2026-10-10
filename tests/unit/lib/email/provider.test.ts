import { ValidationError } from 'lettermint';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
    EmailProvider,
    type EmailSendArguments,
    FallbackEmailProvider,
    LettermintProvider,
} from '~/lib/email/provider';

const MESSAGE: EmailSendArguments = {
    from: 'noreply@sadra.nl',
    html: '<p>Hi Jane</p>',
    subject: 'Welcome',
    to: 'jane@example.com',
};

class FailingProvider extends EmailProvider {
    constructor(private readonly error: Error) {
        super();
    }

    override async send(): Promise<void> {
        throw this.error;
    }
}

class RecordingProvider extends EmailProvider {
    readonly sent: EmailSendArguments[] = [];

    override async send(arguments_: EmailSendArguments): Promise<void> {
        this.sent.push(arguments_);
    }
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('LettermintProvider', () => {
    it('posts the message to the send endpoint with the sending token', async () => {
        const fetch = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(
                Response.json(
                    { message_id: 'msg_1', status: 'pending' },
                    { status: 201 },
                ),
            );

        await new LettermintProvider('lm_test_token').send(MESSAGE);

        expect(fetch).toHaveBeenCalledTimes(1);
        const [url, init] = fetch.mock.calls[0] ?? [];
        expect(url).toEqual(expect.stringMatching(/\/send$/u));
        expect(init?.method).toBe('POST');
        expect(new Headers(init?.headers).get('x-lettermint-token')).toBe(
            'lm_test_token',
        );
        expect(JSON.parse(z.string().parse(init?.body))).toEqual({
            from: MESSAGE.from,
            html: MESSAGE.html,
            subject: MESSAGE.subject,
            to: [MESSAGE.to],
        });
    });

    it('rejects with the SDK error when the API refuses the message', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            Response.json(
                {
                    errors: { to: ['The to field is invalid.'] },
                    message: 'The given data was invalid.',
                },
                { status: 422 },
            ),
        );

        await expect(
            new LettermintProvider('lm_test_token').send(MESSAGE),
        ).rejects.toBeInstanceOf(ValidationError);
    });

    it('reports a missing token when it sends, not when it is constructed', async () => {
        const provider = new LettermintProvider('');

        expect(provider).toBeInstanceOf(LettermintProvider);
        await expect(provider.send(MESSAGE)).rejects.toThrow(
            '`sendingToken` must be a non-empty string.',
        );
    });
});

describe('FallbackEmailProvider', () => {
    it('does not touch the fallback when the primary provider sends', async () => {
        const primary = new RecordingProvider();
        const fallback = new RecordingProvider();

        await new FallbackEmailProvider(primary, fallback).send(MESSAGE);

        expect(primary.sent).toEqual([MESSAGE]);
        expect(fallback.sent).toEqual([]);
    });

    it('sends through the fallback when Lettermint has no token', async () => {
        const fallback = new RecordingProvider();
        const provider = new FallbackEmailProvider(
            new LettermintProvider(''),
            fallback,
        );

        await provider.send(MESSAGE);

        expect(fallback.sent).toEqual([MESSAGE]);
    });

    it('rethrows the fallback error when both providers fail', async () => {
        const fallbackError = new Error('Resend is unavailable');
        const provider = new FallbackEmailProvider(
            new FailingProvider(new Error('Lettermint is unavailable')),
            new FailingProvider(fallbackError),
        );

        await expect(provider.send(MESSAGE)).rejects.toBe(fallbackError);
    });
});
