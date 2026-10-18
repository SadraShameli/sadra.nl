import { describe, expect, it } from 'vitest';

import {
    callbackUrlSchema,
    loginInputSchema,
    magicLinkInputSchema,
} from '~/lib/schemas/auth';

function isAccepted(value: string): boolean {
    return callbackUrlSchema.safeParse(value).success;
}

describe('callbackUrlSchema (open redirect hardening)', () => {
    it('rejects a protocol-relative URL', () => {
        expect(isAccepted('//evil.com')).toBe(false);
    });

    it('rejects a slash followed by a backslash, which browsers read as //', () => {
        expect(isAccepted(String.raw`/\evil.com`)).toBe(false);
    });

    it('rejects a slash followed by two backslashes', () => {
        expect(isAccepted(String.raw`/\\evil.com`)).toBe(false);
    });

    it('rejects a backslash anywhere in the path', () => {
        expect(isAccepted(String.raw`/prop-calculator\..\evil`)).toBe(false);
    });

    it('rejects a tab, which browsers strip before resolving the URL', () => {
        expect(isAccepted('/\t/evil.com')).toBe(false);
        expect(isAccepted('/prop-calculator\t')).toBe(false);
    });

    it('rejects newlines, carriage returns and other control characters', () => {
        expect(isAccepted('/\n/evil.com')).toBe(false);
        expect(isAccepted('/\r/evil.com')).toBe(false);
        expect(isAccepted('/profile\u{0}')).toBe(false);
        expect(isAccepted('/profile\u{1F}')).toBe(false);
        expect(isAccepted('/profile\u{7F}')).toBe(false);
    });

    it('accepts a same-origin path with a query', () => {
        expect(isAccepted('/prop-calculator/accounts/new?firm=apex')).toBe(
            true,
        );
        expect(
            isAccepted(
                '/prop-calculator/accounts/new?firm=apex&plan=apex-50000-eod',
            ),
        ).toBe(true);
    });

    it('accepts percent-encoded characters in the query', () => {
        expect(isAccepted('/prop-calculator/simulator?note=a%20b')).toBe(true);
    });

    it('still accepts the plain same-origin paths used today', () => {
        expect(isAccepted('/')).toBe(true);
        expect(isAccepted('/profile')).toBe(true);
        expect(isAccepted('/trade-checklist/journal')).toBe(true);
    });

    it('rejects a backslash callbackUrl in the login and magic-link inputs', () => {
        expect(
            loginInputSchema.safeParse({
                callbackUrl: String.raw`/\evil.com`,
                email: 'a@b.test',
                password: 'whatever',
            }).success,
        ).toBe(false);
        expect(
            magicLinkInputSchema.safeParse({
                callbackUrl: String.raw`/\evil.com`,
                email: 'a@b.test',
            }).success,
        ).toBe(false);
    });
});
