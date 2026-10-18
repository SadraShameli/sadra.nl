import { renderToReadableStream } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import VerifyRequestPage from '~/app/(auth)/verify-request/page';
import { EmailLink } from '~/lib/auth/EmailLink';

async function pageHtml(link: EmailLink): Promise<string> {
    const stream = await renderToReadableStream(
        <VerifyRequestPage searchParams={Promise.resolve({ link })} />,
    );
    await stream.allReady;
    return new Response(stream).text();
}

describe('verify request page', () => {
    it('names the verification link and its one-hour lifetime after signup', async () => {
        const html = await pageHtml(EmailLink.Verification);
        expect(html).toContain('a verification link');
        expect(html).toContain('expires in 1 hour');
        expect(html).not.toContain('24 hours');
    });

    it('names the sign-in link and its five-minute lifetime after a magic link request', async () => {
        const html = await pageHtml(EmailLink.SignIn);
        expect(html).toContain('a sign-in link');
        expect(html).toContain('expires in 5 minutes');
        expect(html).not.toContain('24 hours');
    });
});
