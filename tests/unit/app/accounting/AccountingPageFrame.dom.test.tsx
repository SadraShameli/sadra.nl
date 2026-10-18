import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountingPageFrame } from '~/app/(app)/accounting/_components/AccountingPageFrame';
import {
    AccountingSection,
    accountingSectionPage,
} from '~/app/(app)/accounting/_components/AccountingSection';
import { routes } from '~/lib/site/routes';

const navigation = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('next/navigation', () => ({
    usePathname: () => navigation.pathname,
}));

describe('AccountingPageFrame', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(section: AccountingSection, pathname: string) {
        navigation.pathname = pathname;
        act(() => {
            root.render(
                <AccountingPageFrame
                    className="frame-under-test"
                    section={section}
                >
                    <p>content</p>
                </AccountingPageFrame>,
            );
        });
    }

    function tabsNav(): HTMLElement | null {
        return container.querySelector(
            ':scope header nav[aria-label="Accounting pages"]',
        );
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

    it('shows the data group tabs under the header of a data page, with the page current', () => {
        render(AccountingSection.Mutations, routes.accounting.mutations);
        expect(container.querySelector('h1')?.textContent).toBe('Mutations');
        const links = [...(tabsNav()?.querySelectorAll('a') ?? [])];
        expect(links.map((link) => link.textContent)).toEqual([
            'Transactions',
            'Mutations',
            'Ledgers',
        ]);
        expect(
            links
                .filter((link) => link.getAttribute('aria-current') === 'page')
                .map((link) => link.textContent),
        ).toEqual(['Mutations']);
    });

    it('shows the setup group tabs on the connections page', () => {
        render(AccountingSection.Connections, routes.accounting.connections);
        expect(
            [...(tabsNav()?.querySelectorAll('a') ?? [])].map(
                (link) => link.textContent,
            ),
        ).toEqual(['Booking rules', 'Connections']);
    });

    it('shows no tabs on a page outside every group', () => {
        render(AccountingSection.Dashboard, routes.accounting.index);
        expect(container.querySelector('h1')?.textContent).toBe('Import');
        expect(tabsNav()).toBeNull();
    });

    it('gives the run detail page its back link to the runs page and no tabs or eyebrow', () => {
        render(AccountingSection.RunDetail, routes.accounting.run('run-1'));
        const back = container.querySelector(':scope header a');
        expect(back?.textContent).toBe(
            accountingSectionPage(AccountingSection.Runs).title,
        );
        expect(back?.getAttribute('href')).toBe(routes.accounting.runs);
        expect(tabsNav()).toBeNull();
        expect(container.querySelector(':scope header nav')).toBeNull();
    });
});
