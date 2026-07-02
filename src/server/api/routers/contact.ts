import { TRPCError } from '@trpc/server';

import { ROOT_EMAIL } from '~/lib/auth/roles';
import { ContactFormEmail, mailer } from '~/lib/email';
import { captureError } from '~/lib/observability/logger';
import { checkRateLimit } from '~/lib/observability/rate-limit';
import { contactInputSchema } from '~/lib/schemas/contact';
import { createTRPCRouter, publicProcedure } from '~/server/api/trpc';

export const contactRouter = createTRPCRouter({
    send: publicProcedure
        .input(contactInputSchema)
        .mutation(async ({ ctx, input }) => {
            if (input.honeypot) {
                return { ok: true };
            }

            const ip =
                ctx.headers.get('x-forwarded-for')?.split(',', 1)[0]?.trim() ??
                ctx.headers.get('x-real-ip') ??
                'unknown';
            const isOkEmail = await checkRateLimit({
                bucket: 'contact:email',
                key: input.email,
                max: 3,
                windowMs: 60 * 60 * 1000,
            });
            const isOkIp = await checkRateLimit({
                bucket: 'contact:ip',
                key: ip,
                max: 10,
                windowMs: 60 * 60 * 1000,
            });
            if (!isOkEmail || !isOkIp) {
                throw new TRPCError({
                    code: 'TOO_MANY_REQUESTS',
                    message: 'Too many messages — try again later.',
                });
            }

            try {
                await mailer.send(
                    new ContactFormEmail(
                        ROOT_EMAIL,
                        input.name,
                        input.email,
                        ip,
                        input.message,
                    ),
                );
                return { ok: true };
            } catch (error) {
                captureError(error, { tag: 'contact.send' });
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Could not send your message right now.',
                });
            }
        }),
});
