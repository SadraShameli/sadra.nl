import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { callbackUrlSchema } from '~/lib/schemas/auth';
import {
    isPrivatePath,
    loginRedirectFor,
    PRIVATE_PREFIXES,
    readCallbackUrl,
} from '~/lib/site/privateRoutes';
import { routes } from '~/lib/site/routes';

const ORIGIN = 'https://sadra.test';

function callbackOf(redirect: string): null | string {
    const url = new URL(redirect, ORIGIN);
    expect(url.origin).toBe(ORIGIN);
    expect(url.pathname).toBe(routes.auth.login);
    return url.searchParams.get('callbackUrl');
}

describe('isPrivatePath', () => {
    it('guards the accounts area and every route below it', () => {
        expect(isPrivatePath('/prop-calculator/accounts')).toBe(true);
        expect(isPrivatePath('/prop-calculator/accounts/x')).toBe(true);
        expect(isPrivatePath('/prop-calculator/accounts/new')).toBe(true);
        expect(
            isPrivatePath(
                routes.propCalculator.accounts.edit(
                    '5b0c3f7e-8a51-4c4e-9f0a-3d0f1c2b4a61',
                ),
            ),
        ).toBe(true);
    });

    it('keeps the hub and the calculator tools public', () => {
        expect(isPrivatePath('/prop-calculator')).toBe(false);
        expect(isPrivatePath('/prop-calculator/simulator')).toBe(false);
        expect(isPrivatePath(routes.propCalculator.compare)).toBe(false);
        expect(isPrivatePath(routes.propCalculator.payoutPlanner)).toBe(false);
    });

    it('does not treat a sibling that only shares the prefix text as private', () => {
        expect(isPrivatePath('/prop-calculator/accountsx')).toBe(false);
        expect(isPrivatePath('/profilex')).toBe(false);
    });

    it('keeps profile and trade-checklist private', () => {
        expect(isPrivatePath('/profile')).toBe(true);
        expect(isPrivatePath('/profile/anything')).toBe(true);
        expect(isPrivatePath('/trade-checklist')).toBe(true);
        expect(isPrivatePath('/trade-checklist/journal')).toBe(true);
    });

    it('leaves public pages alone', () => {
        expect(isPrivatePath('/')).toBe(false);
        expect(isPrivatePath('/portfolio')).toBe(false);
        expect(isPrivatePath('/login')).toBe(false);
    });

    it('lists the accounts index as a private prefix', () => {
        expect(PRIVATE_PREFIXES).toContain(
            routes.propCalculator.accounts.index,
        );
        expect(PRIVATE_PREFIXES).toContain(routes.profile);
        expect(PRIVATE_PREFIXES).toContain(routes.tradeChecklist.index);
    });
});

describe('loginRedirectFor', () => {
    it('keeps the search in the callbackUrl', () => {
        expect(
            callbackOf(
                loginRedirectFor(
                    '/prop-calculator/accounts/new',
                    '?firm=apex&plan=x',
                ),
            ),
        ).toBe('/prop-calculator/accounts/new?firm=apex&plan=x');
    });

    it('uses the bare path when there is no search', () => {
        expect(callbackOf(loginRedirectFor('/prop-calculator/accounts'))).toBe(
            '/prop-calculator/accounts',
        );
        expect(
            callbackOf(loginRedirectFor('/prop-calculator/accounts', '')),
        ).toBe('/prop-calculator/accounts');
    });

    it('accepts a search without its leading question mark', () => {
        expect(
            callbackOf(
                loginRedirectFor('/prop-calculator/accounts/new', 'a=1'),
            ),
        ).toBe('/prop-calculator/accounts/new?a=1');
    });

    it('drops a search that would make the callbackUrl unsafe and keeps the path', () => {
        expect(
            callbackOf(
                loginRedirectFor(
                    '/prop-calculator/accounts',
                    String.raw`?next=\evil.com`,
                ),
            ),
        ).toBe('/prop-calculator/accounts');
    });

    it('drops an oversized search and keeps the path', () => {
        const oversized = `?q=${'a'.repeat(600)}`;
        expect(
            callbackOf(
                loginRedirectFor('/prop-calculator/accounts', oversized),
            ),
        ).toBe('/prop-calculator/accounts');
    });

    it('omits the callbackUrl when even the path is not a safe same-origin path', () => {
        expect(callbackOf(loginRedirectFor('//evil.com/x', '?a=1'))).toBeNull();
        expect(callbackOf(loginRedirectFor(String.raw`/\evil.com`))).toBeNull();
    });

    it('only ever emits a callbackUrl that the schema accepts', () => {
        const cases: readonly [string, string][] = [
            ['/prop-calculator/accounts/new', '?firm=apex&plan=x'],
            ['/profile', '?tab=trading'],
            ['/trade-checklist/journal', ''],
            ['/prop-calculator/accounts', '?x=%0A'],
        ];
        for (const [pathname, search] of cases) {
            const callback = callbackOf(loginRedirectFor(pathname, search));
            expect(callback).not.toBeNull();
            expect(callbackUrlSchema.safeParse(callback).success).toBe(true);
        }
    });
});

describe('the proxy module graph', () => {
    it('loads the callbackUrl check without the zxcvbn password dictionary', async () => {
        vi.resetModules();
        vi.doMock('zxcvbn', () => {
            throw new Error('zxcvbn was loaded by the proxy module graph');
        });
        try {
            const privateRoutes = await import('~/lib/site/privateRoutes');
            expect(
                callbackOf(
                    privateRoutes.loginRedirectFor(
                        routes.propCalculator.accounts.index,
                    ),
                ),
            ).toBe(routes.propCalculator.accounts.index);
        } finally {
            vi.doUnmock('zxcvbn');
            vi.resetModules();
        }
    });
});

function callbackQuery(callbackUrl: null | string): URLSearchParams {
    return new URLSearchParams(callbackUrl === null ? {} : { callbackUrl });
}

describe('readCallbackUrl', () => {
    const AUTH_READERS: readonly string[] = [
        'login/LoginForm.tsx',
        'signup/SignupForm.tsx',
        '_components/MagicLinkForm.tsx',
        '_components/OAuthButtons.tsx',
    ];

    it('returns a safe same-origin callbackUrl as it is', () => {
        const safe = '/prop-calculator/accounts/new?firm=apex';
        expect(readCallbackUrl(callbackQuery(safe))).toBe(safe);
    });

    it('falls back to the home route for a missing or unsafe callbackUrl', () => {
        for (const unsafe of [
            null,
            '',
            '//evil.com',
            String.raw`/\evil.com`,
            'https://evil.com',
            'javascript:alert(1)',
            '/accounts\r\nLocation: https://evil.com',
            `/${'a'.repeat(600)}`,
        ]) {
            expect(readCallbackUrl(callbackQuery(unsafe)), String(unsafe)).toBe(
                routes.home,
            );
        }
    });

    it('is the one callbackUrl reader of every auth path', () => {
        for (const file of AUTH_READERS) {
            const source = readFileSync(
                path.join(process.cwd(), 'src', 'app', '(auth)', file),
                'utf8',
            );
            expect(source, file).toMatch(/readCallbackUrl\(searchParameters\)/);
            expect(source, file).not.toMatch(/callbackUrlSchema/);
            expect(source, file).not.toMatch(/get\('callbackUrl'\)/);
        }
    });
});
