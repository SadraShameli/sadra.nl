import { Resend } from 'resend';

import { env } from '~/env';

const resend = new Resend(env.RESEND_API_KEY);

export async function sendPasswordResetEmail(to: string, token: string) {
    const url = `${process.env.NEXT_PUBLIC_SERVER_URL}/reset-password?token=${token}`;

    await resend.emails.send({
        from: 'noreply@sadra.nl',
        to,
        subject: 'Reset your password — sadra.nl',
        html: `
<p>Hi,</p>
<p>Click the link below to reset your password. It expires in 1 hour.</p>
<p><a href="${url}">${url}</a></p>
<p>If you didn't request this, you can ignore this email.</p>
        `.trim(),
    });
}
