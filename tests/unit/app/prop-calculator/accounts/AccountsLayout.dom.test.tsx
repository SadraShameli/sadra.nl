import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loginRedirectFor } from '~/lib/site/privateRoutes';
import { routes } from '~/lib/site/routes';

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

vi.mock(
    '~/app/(app)/prop-calculator/accounts/_components/AccountsSubnav',
    () => ({ AccountsSubnav: () => null }),
);

const { default: PropAccountsLayout, metadata } =
    await import('~/app/(app)/prop-calculator/accounts/layout');

const LOGIN_REDIRECT = '/login?callbackUrl=%2Fprop-calculator%2Faccounts';

describe('the accounts layout guard (F-56)', () => {
    beforeEach(() => {
        harness.session.mockReset();
        harness.redirect.mockClear();
    });

    it('redirects a signed-out visitor to the login with the accounts index as the callback', async () => {
        harness.session.mockResolvedValue(null);
        await expect(PropAccountsLayout({ children: null })).rejects.toThrow(
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
        await expect(PropAccountsLayout({ children: null })).rejects.toThrow(
            'redirect:',
        );
        expect(harness.redirect).toHaveBeenCalledWith(LOGIN_REDIRECT);
    });

    it('renders the area for a signed-in user without redirecting', async () => {
        harness.session.mockResolvedValue({ user: { id: 'user-1' } });
        const tree = await PropAccountsLayout({ children: null });
        expect(tree).toBeTruthy();
        expect(harness.redirect).not.toHaveBeenCalled();
    });

    it('keeps every accounts page out of search engines', () => {
        expect(metadata.robots).toEqual({ follow: false, index: false });
    });
});
