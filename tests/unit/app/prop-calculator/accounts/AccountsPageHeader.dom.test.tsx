import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountsPageHeader } from '~/app/(app)/prop-calculator/accounts/_components/AccountsPageHeader';
import { routes } from '~/lib/site/routes';

const { accounts } = routes.propCalculator;
const ACCOUNT_ID = '5b0c3f7e-8a51-4c4e-9f0a-3d0f1c2b4a61';

const navigation = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('next/navigation', () => ({
    usePathname: () => navigation.pathname,
}));

describe('AccountsPageHeader', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(pathname: string, title: string) {
        navigation.pathname = pathname;
        act(() => {
            root.render(<AccountsPageHeader title={title} />);
        });
    }

    function tabLinks(): HTMLAnchorElement[] {
        return [
            ...container.querySelectorAll<HTMLAnchorElement>(
                ':scope header nav[aria-label="Prop accounts pages"] a',
            ),
        ];
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.unstubAllGlobals();
    });

    it('shows the planning tabs on the rounds page with rounds current', () => {
        render(accounts.rounds, 'Rounds');
        expect(tabLinks().map((link) => link.textContent)).toEqual([
            'Next slot',
            'Rounds',
            'Copy groups',
            'Edge',
        ]);
        expect(
            tabLinks()
                .filter((link) => link.getAttribute('aria-current') === 'page')
                .map((link) => link.getAttribute('href')),
        ).toEqual([accounts.rounds]);
    });

    it('shows the setup tabs on the import page', () => {
        render(accounts.import, 'Import');
        expect(tabLinks().map((link) => link.textContent)).toEqual([
            'Rulebook',
            'Firms',
            'Import',
        ]);
    });

    it('shows no tabs on the overview, the add account page or an edit page', () => {
        for (const pathname of [
            accounts.index,
            accounts.new,
            accounts.edit(ACCOUNT_ID),
        ]) {
            render(pathname, 'Prop accounts');
            expect(
                container.querySelector(':scope header nav'),
                pathname,
            ).toBeNull();
        }
    });
});
