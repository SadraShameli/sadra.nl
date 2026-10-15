import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loginRedirectFor } from '~/lib/site/privateRoutes';
import { routes } from '~/lib/site/routes';
import { proxyRedirect } from '~/proxy';

import { resolveServerTree } from '../../resolveServerTree';
import { propCalculatorAppDir } from '../appPageFiles';

const harness = vi.hoisted(() => ({
    redirect: vi.fn((href: string): never => {
        throw new Error(`redirect:${href}`);
    }),
    session: vi.fn(),
}));

vi.mock('~/lib/auth/server', () => ({
    getServerSession: harness.session,
}));

vi.mock('next/navigation', () => ({
    redirect: harness.redirect,
}));

vi.mock('~/trpc/server', () => {
    const recorder = (): unknown =>
        new Proxy(vi.fn(), {
            get: (_target, key) =>
                key === 'prefetch' ? () => Promise.resolve() : recorder(),
        });
    return {
        api: recorder(),
        HydrateClient: ({ children }: { children: ReactNode }) => children,
    };
});

vi.mock(
    '~/app/(app)/prop-calculator/accounts/_components/AccountsSubnav',
    () => ({ AccountsSubnav: () => null }),
);

vi.mock(
    '~/app/(app)/prop-calculator/accounts/_components/overview/OverviewView',
    () => ({ OverviewView: () => null }),
);

const { default: PropAccountsLayout, metadata } =
    await import('~/app/(app)/prop-calculator/accounts/layout');
const { default: PropAccountsPage } =
    await import('~/app/(app)/prop-calculator/accounts/page');

const LOGIN_REDIRECT = '/login?callbackUrl=%2Fprop-calculator%2Faccounts';
const TEMPORARY_REDIRECT = 307;
const ACCOUNTS_APP_DIR = propCalculatorAppDir('accounts');
const PAGE_SESSION_GUARD = /loginRedirectFor\(|openAccountPage\(/;

function accountsPageFiles(): string[] {
    return readdirSync(ACCOUNTS_APP_DIR, { encoding: 'utf8', recursive: true })
        .filter((entry) => path.basename(entry) === 'page.tsx')
        .map((entry) => path.join(ACCOUNTS_APP_DIR, entry));
}

describe('the accounts area guard (F-56)', () => {
    beforeEach(() => {
        harness.session.mockReset();
        harness.redirect.mockClear();
    });

    it('sends a signed-out visitor of the accounts index to the login before any page renders', () => {
        expect(
            proxyRedirect(routes.propCalculator.accounts.index, '', false),
        ).toEqual({ location: LOGIN_REDIRECT, status: TEMPORARY_REDIRECT });
        expect(
            proxyRedirect(routes.propCalculator.accounts.new, '', false),
        ).not.toBeNull();
    });

    it('redirects a signed-out visitor to the login with the accounts index as the callback', async () => {
        harness.session.mockResolvedValue(null);
        await expect(resolveServerTree(PropAccountsPage())).rejects.toThrow(
            'redirect:',
        );
        expect(harness.redirect).toHaveBeenCalledTimes(1);
        expect(harness.redirect).toHaveBeenCalledWith(
            loginRedirectFor(routes.propCalculator.accounts.index),
        );
        expect(harness.redirect).toHaveBeenCalledWith(LOGIN_REDIRECT);
    });

    it('redirects a session that carries no user id', async () => {
        harness.session.mockResolvedValue({ user: { id: '' } });
        await expect(resolveServerTree(PropAccountsPage())).rejects.toThrow(
            'redirect:',
        );
        expect(harness.redirect).toHaveBeenCalledWith(LOGIN_REDIRECT);
    });

    it('renders the overview for a signed-in user without redirecting', async () => {
        harness.session.mockResolvedValue({ user: { id: 'user-1' } });
        const tree = await resolveServerTree(PropAccountsPage());
        expect(tree).toBeTruthy();
        expect(harness.session).toHaveBeenCalledTimes(1);
        expect(harness.redirect).not.toHaveBeenCalled();
    });

    it('checks the session on every accounts page, since the layout no longer does', () => {
        const pages = accountsPageFiles();
        expect(pages.length).toBeGreaterThan(10);
        const unguarded = pages.filter(
            (file) => !PAGE_SESSION_GUARD.test(readFileSync(file, 'utf8')),
        );
        expect(unguarded).toEqual([]);
    });

    it('renders the layout shell without reading the session', async () => {
        const tree = await resolveServerTree(
            PropAccountsLayout({
                children: null,
                params: Promise.resolve({}),
            }),
        );
        expect(tree).toBeTruthy();
        expect(harness.session).not.toHaveBeenCalled();
    });

    it('keeps every accounts page out of search engines', () => {
        expect(metadata.robots).toEqual({ follow: false, index: false });
    });
});
