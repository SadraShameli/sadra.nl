import { Lettermint } from 'lettermint';
import { Resend } from 'resend';

import { env } from '~/env';

const lettermint = Lettermint.email(env.LETTERMINT_PROJECT_TOKEN);
const resend = new Resend(env.RESEND_API_KEY);

const FROM = 'noreply@sadra.nl';

export async function sendPasswordResetEmail(to: string, token: string) {
    const url = `${env.NEXT_PUBLIC_SERVER_URL}/reset-password?token=${token}`;
    const subject = 'Reset your password — sadra.nl';
    const html = `
<p>Hi,</p>
<p>Click the link below to reset your password. It expires in 1 hour.</p>
<p><a href="${url}">${url}</a></p>
<p>If you didn't request this, you can ignore this email.</p>
    `.trim();

    try {
        await lettermint.from(FROM).to(to).subject(subject).html(html).send();
    } catch {
        await resend.emails.send({ from: FROM, to, subject, html });
    }
}

export async function sendMagicLinkEmail(to: string, url: string) {
    const subject = 'Sign in to sadra.nl';
    const html = `
<p>Hi,</p>
<p>Click the link below to sign in. It expires in 24 hours.</p>
<p><a href="${url}">Sign in to sadra.nl</a></p>
<p>If you didn't request this, you can ignore this email.</p>
    `.trim();

    try {
        await lettermint.from(FROM).to(to).subject(subject).html(html).send();
    } catch {
        await resend.emails.send({ from: FROM, to, subject, html });
    }
}
