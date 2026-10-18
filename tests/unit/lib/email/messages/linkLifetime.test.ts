import { describe, expect, it } from 'vitest';

import { EmailVerificationEmail } from '~/lib/email/messages/email-verification';
import { MagicLinkEmail } from '~/lib/email/messages/magic-link';

const URL = 'https://sadra.nl/api/auth/link?token=abc';

describe('authentication link lifetimes in email copy', () => {
    it('states the five-minute sign-in link lifetime', async () => {
        const html = await new MagicLinkEmail('a@b.test', URL).render();
        expect(html).toContain('expires in 5 minutes');
        expect(html).not.toContain('24 hours');
    });

    it('states the one-hour verification link lifetime', async () => {
        const html = await new EmailVerificationEmail('a@b.test', URL).render();
        expect(html).toContain('expires in 1 hour');
        expect(html).not.toContain('24 hours');
    });
});
