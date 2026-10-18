import { describe, expect, it } from 'vitest';

import {
    activeSubnavGroup,
    subnavHref,
    SubnavMatch,
} from '~/app/(app)/_components/routeSubnavLinks';
import { ACCOUNTS_NAV_ITEMS } from '~/app/(app)/prop-calculator/accounts/_components/accountsNavItems';
import { compareText } from '~/lib/prop-accounts';
import { routes } from '~/lib/site/routes';

import { currentSubnavLabels, subnavPages } from '../../subnavPages';
import { accountsPageRoutes, hasAccountsPage } from '../accountsPageFiles';

const { accounts } = routes.propCalculator;
const ACCOUNT_ID = '5b0c3f7e-8a51-4c4e-9f0a-3d0f1c2b4a61';
const HEADER_ACTION_ROUTES: readonly string[] = [accounts.new];

const STATIC_ACCOUNT_ROUTES: readonly string[] = Object.values(accounts).filter(
    (value) => typeof value === 'string',
);

function currentItems(pathname: string): readonly string[] {
    return currentSubnavLabels(pathname, ACCOUNTS_NAV_ITEMS);
}

function navPageHrefs(): string[] {
    return subnavPages(ACCOUNTS_NAV_ITEMS).map((page) => page.href);
}

describe('ACCOUNTS_NAV_ITEMS', () => {
    it('lists the short section nav in order', () => {
        expect(ACCOUNTS_NAV_ITEMS.map((item) => item.label)).toEqual([
            'Overview',
            'Weekly review',
            'Ledger',
            'Planning',
            'Setup',
        ]);
    });

    it('groups the planning pages and the setup pages', () => {
        const groups = ACCOUNTS_NAV_ITEMS.filter(
            (item) => item.pages !== undefined,
        );
        expect(
            groups.map((item) => [
                item.label,
                item.pages?.map((page) => [page.label, page.href]),
            ]),
        ).toEqual([
            [
                'Planning',
                [
                    ['Next slot', accounts.nextSlot],
                    ['Rounds', accounts.rounds],
                    ['Copy groups', accounts.copyGroups],
                    ['Edge', accounts.edge],
                ],
            ],
            [
                'Setup',
                [
                    ['Rulebook', accounts.rulebook],
                    ['Firms', accounts.firms],
                    ['Import', accounts.import],
                ],
            ],
        ]);
    });

    it('links each group to its first page', () => {
        for (const item of ACCOUNTS_NAV_ITEMS) {
            if (item.pages === undefined) continue;
            expect(item.href).toBe(item.pages[0].href);
        }
    });

    it('reaches every static accounts page once, except the add account page the overview header links', () => {
        const hrefs = navPageHrefs();
        expect(new Set(hrefs).size).toBe(hrefs.length);
        expect(hrefs).not.toContain(accounts.new);
        expect(
            [...hrefs, ...HEADER_ACTION_ROUTES].toSorted(compareText),
        ).toEqual([...STATIC_ACCOUNT_ROUTES].toSorted(compareText));
    });

    it('takes every href from routes.propCalculator.accounts with no query', () => {
        for (const href of navPageHrefs()) {
            expect(STATIC_ACCOUNT_ROUTES).toContain(href);
            expect(href).not.toContain('?');
        }
        for (const item of ACCOUNTS_NAV_ITEMS) {
            expect(item.carriesQuery ?? false).toBe(false);
            expect(subnavHref(item, '?firm=apex')).toBe(item.href);
        }
    });

    it('gives every item and every grouped page a label', () => {
        for (const entry of [
            ...ACCOUNTS_NAV_ITEMS,
            ...subnavPages(ACCOUNTS_NAV_ITEMS),
        ]) {
            expect(entry.label.trim()).not.toBe('');
        }
    });

    it('matches the overview item by prefix and every other item exactly', () => {
        const overview = ACCOUNTS_NAV_ITEMS.find(
            (item) => item.href === accounts.index,
        );
        expect(overview?.match).toBe(SubnavMatch.Prefix);
        for (const item of ACCOUNTS_NAV_ITEMS) {
            if (item.href === accounts.index) continue;
            expect(item.match ?? SubnavMatch.Exact).toBe(SubnavMatch.Exact);
        }
    });
});

describe('accounts nav availability (deploy safety)', () => {
    it('links only accounts pages that exist', () => {
        expect(navPageHrefs().filter((href) => !hasAccountsPage(href))).toEqual(
            [],
        );
        for (const href of HEADER_ACTION_ROUTES) {
            expect(hasAccountsPage(href), href).toBe(true);
        }
    });

    it('gives every static accounts page on disk a nav decision', () => {
        const reachable = new Set([...navPageHrefs(), ...HEADER_ACTION_ROUTES]);
        const pages = accountsPageRoutes();
        expect(pages).toContain(accounts.index);
        expect(pages.filter((route) => !reachable.has(route))).toEqual([]);
    });

    it('marks exactly one item current on every accounts page that exists', () => {
        const pathnames = [
            ...accountsPageRoutes(),
            accounts.detail(ACCOUNT_ID),
            accounts.edit(ACCOUNT_ID),
        ];
        for (const pathname of pathnames) {
            expect(currentItems(pathname), pathname).toHaveLength(1);
        }
    });
});

describe('the current accounts nav item', () => {
    it('is only the most specific item on the ledger and review pages', () => {
        expect(currentItems(accounts.ledger)).toEqual(['Ledger']);
        expect(currentItems(accounts.review)).toEqual(['Weekly review']);
    });

    it('is the group on each page it groups', () => {
        expect(currentItems(accounts.nextSlot)).toEqual(['Planning']);
        expect(currentItems(accounts.edge)).toEqual(['Planning']);
        expect(currentItems(accounts.rulebook)).toEqual(['Setup']);
        expect(currentItems(accounts.import)).toEqual(['Setup']);
    });

    it('is the overview on the add account page, an account detail and its edit page', () => {
        expect(currentItems(accounts.index)).toEqual(['Overview']);
        expect(currentItems(accounts.new)).toEqual(['Overview']);
        expect(currentItems(accounts.detail(ACCOUNT_ID))).toEqual(['Overview']);
        expect(currentItems(accounts.edit(ACCOUNT_ID))).toEqual(['Overview']);
    });

    it('is exactly one item on every accounts route', () => {
        const pathnames = [
            ...STATIC_ACCOUNT_ROUTES,
            accounts.detail(ACCOUNT_ID),
            accounts.edit(ACCOUNT_ID),
        ];
        for (const pathname of pathnames) {
            expect(currentItems(pathname), pathname).toHaveLength(1);
        }
    });

    it('is none outside the accounts area', () => {
        expect(currentItems(routes.propCalculator.simulator)).toEqual([]);
        expect(currentItems('/prop-calculator/accountsx')).toEqual([]);
    });
});

describe('the accounts group tabs', () => {
    it('show only on a grouped page', () => {
        expect(
            activeSubnavGroup(accounts.rounds, ACCOUNTS_NAV_ITEMS)?.label,
        ).toBe('Planning');
        expect(
            activeSubnavGroup(accounts.firms, ACCOUNTS_NAV_ITEMS)?.label,
        ).toBe('Setup');
        expect(
            activeSubnavGroup(accounts.index, ACCOUNTS_NAV_ITEMS),
        ).toBeUndefined();
        expect(
            activeSubnavGroup(accounts.edit(ACCOUNT_ID), ACCOUNTS_NAV_ITEMS),
        ).toBeUndefined();
    });
});
