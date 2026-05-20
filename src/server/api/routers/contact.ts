import { TRPCError } from '@trpc/server';

import { ROOT_EMAIL } from '~/lib/auth/roles';
import { sendWithFallback } from '~/lib/email';
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
                ctx.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
                ctx.headers.get('x-real-ip') ??
                'unknown';
            const okEmail = await checkRateLimit({
                bucket: 'contact:email',
                key: input.email,
                max: 3,
                windowMs: 60 * 60 * 1000,
            });
            const okIp = await checkRateLimit({
                bucket: 'contact:ip',
                key: ip,
                max: 10,
                windowMs: 60 * 60 * 1000,
            });
            if (!okEmail || !okIp) {
                throw new TRPCError({
                    code: 'TOO_MANY_REQUESTS',
                    message: 'Too many messages — try again later.',
                });
            }

            const subject = `Contact form — ${input.name}`;
            const html = `
<p><strong>From:</strong> ${escapeHtml(input.name)} &lt;${escapeHtml(input.email)}&gt;</p>
<p><strong>IP:</strong> ${escapeHtml(ip)}</p>
<hr />
<pre>${escapeHtml(input.message)}</pre>
        `.trim();

            try {
                await sendWithFallback({
                    html,
                    subject,
                    to: ROOT_EMAIL,
                });
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

function escapeHtml(s: string): string {
    return s
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
