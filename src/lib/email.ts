import { Lettermint } from 'lettermint';
import { Resend } from 'resend';

import { env } from '~/env';
import { ROOT_EMAIL } from '~/lib/auth/roles';

let _lettermint: null | ReturnType<typeof Lettermint.email> = null;
let _resend: null | Resend = null;

function getLettermint() {
    _lettermint ??= Lettermint.email(env.LETTERMINT_PROJECT_TOKEN);
    return _lettermint;
}

function getResend() {
    _resend ??= new Resend(env.RESEND_API_KEY);
    return _resend;
}

export const EMAIL_FROM = 'noreply@sadra.nl';

export async function sendMagicLinkEmail(to: string, url: string) {
    const subject = 'Sign in to sadra.nl';
    const html = `
<p>Hi,</p>
<p>Click the link below to sign in. It expires in 24 hours.</p>
<p><a href="${url}">Sign in to sadra.nl</a></p>
<p>If you didn't request this, you can ignore this email.</p>
    `.trim();
    await sendWithFallback({ html, subject, to });
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
    await sendWithFallback({ html, subject, to });
}

export async function sendSignUpNotification(
    email: string,
    name: null | string | undefined,
) {
    const subject = 'New sign-up — sadra.nl';
    const html = `
<p>A new user just signed up.</p>
<p><strong>Email:</strong> ${email}</p>
${name ? `<p><strong>Name:</strong> ${name}</p>` : ''}
    `.trim();
    await sendWithFallback({ html, subject, to: ROOT_EMAIL });
}

export async function sendWithFallback(args: {
    html: string;
    subject: string;
    to: string;
}) {
    try {
        await getLettermint()
            .from(EMAIL_FROM)
            .to(args.to)
            .subject(args.subject)
            .html(args.html)
            .send();
    } catch (error) {
        try {
            await getResend().emails.send({
                from: EMAIL_FROM,
                html: args.html,
                subject: args.subject,
                to: args.to,
            });
        } catch (error_) {
            console.error('[email] primary send failed', error);
            console.error('[email] fallback send failed', error_);
            throw error_;
        }
    }
}
