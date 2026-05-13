import { Lettermint } from 'lettermint';
import { Resend } from 'resend';

import { env } from '~/env';

const lettermint = Lettermint.email(env.LETTERMINT_PROJECT_TOKEN);
const resend = new Resend(env.RESEND_API_KEY);

export const EMAIL_FROM = 'noreply@sadra.nl';

async function sendWithFallback(args: {
    to: string;
    subject: string;
    html: string;
}) {
    try {
        await lettermint
            .from(EMAIL_FROM)
            .to(args.to)
            .subject(args.subject)
            .html(args.html)
            .send();
    } catch (primaryErr) {
        try {
            await resend.emails.send({
                from: EMAIL_FROM,
                to: args.to,
                subject: args.subject,
                html: args.html,
            });
        } catch (fallbackErr) {
            console.error('[email] primary send failed', primaryErr);
            console.error('[email] fallback send failed', fallbackErr);
            throw fallbackErr;
        }
    }
}

export async function sendPasswordResetEmail(to: string, token: string) {
    const url = `${env.NEXT_PUBLIC_SERVER_URL}/reset-password?token=${token}`;
    const subject = 'Reset your password — sadra.nl';
    const html = `
<p>Hi,</p>
<p>Click the link below to reset your password. It expires in 1 hour.</p>
<p><a href="${url}">${url}</a></p>
<p>If you didn't request this, you can ignore this email.</p>
    `.trim();
    await sendWithFallback({ to, subject, html });
}

export async function sendMagicLinkEmail(to: string, url: string) {
    const subject = 'Sign in to sadra.nl';
    const html = `
<p>Hi,</p>
<p>Click the link below to sign in. It expires in 24 hours.</p>
<p><a href="${url}">Sign in to sadra.nl</a></p>
<p>If you didn't request this, you can ignore this email.</p>
    `.trim();
    await sendWithFallback({ to, subject, html });
}
