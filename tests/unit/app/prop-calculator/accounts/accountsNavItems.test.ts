import { describe, expect, it } from 'vitest';

import { type RouteSubnavItem } from '~/app/(app)/_components/RouteSubnav';
import {
    activeSubnavHref,
    subnavHref,
    subnavLinkAttributes,
    SubnavMatch,
} from '~/app/(app)/_components/routeSubnavLinks';
import {
    ACCOUNTS_NAV_CATALOG,
    ACCOUNTS_NAV_ITEMS,
} from '~/app/(app)/prop-calculator/accounts/_components/accountsNavItems';
import { compareText } from '~/lib/prop-accounts';
import { routes } from '~/lib/site/routes';

import { accountsPageRoutes, hasAccountsPage } from '../accountsPageFiles';

const { accounts } = routes.propCalculator;
const ACCOUNT_ID = '5b0c3f7e-8a51-4c4e-9f0a-3d0f1c2b4a61';

const STATIC_ACCOUNT_ROUTES: readonly string[] = Object.values(accounts).filter(
    (value) => typeof value === 'string',
);

function currentItems(
    pathname: string,
    items: readonly RouteSubnavItem[] = ACCOUNTS_NAV_CATALOG,
): readonly string[] {
    const active = activeSubnavHref(pathname, items);
    return items
        .filter(
            (item) =>
                subnavLinkAttributes(item, active)['aria-current'] === 'page',
        )
        .map((item) => item.href);
}

describe('ACCOUNTS_NAV_CATALOG', () => {
    it('lists every static accounts page up front, each once', () => {
        const hrefs = ACCOUNTS_NAV_CATALOG.map((item) => item.href);
        expect(new Set(hrefs).size).toBe(hrefs.length);
        expect([...hrefs].toSorted(compareText)).toEqual(
            [...STATIC_ACCOUNT_ROUTES].toSorted(compareText),
        );
    });

    it('takes every href from routes.propCalculator.accounts with no query', () => {
        for (const item of ACCOUNTS_NAV_CATALOG) {
            expect(STATIC_ACCOUNT_ROUTES).toContain(item.href);
            expect(item.href).not.toContain('?');
            expect(item.carriesQuery ?? false).toBe(false);
            expect(subnavHref(item, '?firm=apex')).toBe(item.href);
        }
    });

    it('gives every item a label', () => {
        for (const item of ACCOUNTS_NAV_CATALOG) {
            expect(item.label.trim()).not.toBe('');
        }
    });

    it('gives the firms bankroll page a nav entry now that it is built', () => {
        expect(
            ACCOUNTS_NAV_CATALOG.find((item) => item.href === accounts.firms)
                ?.hasPage,
        ).toBe(true);
    });

    it('matches the overview item by prefix and every other item exactly', () => {
        const overview = ACCOUNTS_NAV_CATALOG.find(
            (item) => item.href === accounts.index,
        );
        expect(overview?.match).toBe(SubnavMatch.Prefix);
        for (const item of ACCOUNTS_NAV_CATALOG) {
            if (item.href === accounts.index) continue;
            expect(item.match ?? SubnavMatch.Exact).toBe(SubnavMatch.Exact);
        }
    });
});

describe('accounts nav availability (deploy safety)', () => {
    it('flags an item as having a page exactly when its page.tsx exists', () => {
        for (const item of ACCOUNTS_NAV_CATALOG) {
            expect({ hasPage: item.hasPage, href: item.href }).toEqual({
                hasPage: hasAccountsPage(item.href),
                href: item.href,
            });
        }
    });

    it('links only accounts pages that exist', () => {
        expect(
            ACCOUNTS_NAV_ITEMS.map((item) => item.href).filter(
                (href) => !hasAccountsPage(href),
            ),
        ).toEqual([]);
    });

    it('links exactly the catalog items that have a page, in catalog order', () => {
        expect(ACCOUNTS_NAV_ITEMS.map((item) => item.href)).toEqual(
            ACCOUNTS_NAV_CATALOG.filter((item) => item.hasPage).map(
                (item) => item.href,
            ),
        );
    });

    it('gives every static accounts page on disk a nav item decision', () => {
        const catalogHrefs = new Set(
            ACCOUNTS_NAV_CATALOG.map((item) => item.href),
        );
        const pages = accountsPageRoutes();
        expect(pages).toContain(accounts.index);
        expect(pages.filter((route) => !catalogHrefs.has(route))).toEqual([]);
    });

    it('marks exactly one linked item current on every accounts page that exists', () => {
        const pathnames = [
            ...accountsPageRoutes(),
            accounts.detail(ACCOUNT_ID),
            accounts.edit(ACCOUNT_ID),
        ];
        for (const pathname of pathnames) {
            expect(currentItems(pathname, ACCOUNTS_NAV_ITEMS)).toHaveLength(1);
        }
    });
});

describe('the current accounts nav item once every page exists', () => {
    it('is only the most specific item on the ledger and review pages', () => {
        expect(currentItems(accounts.ledger)).toEqual([accounts.ledger]);
        expect(currentItems(accounts.review)).toEqual([accounts.review]);
    });

    it('is the overview on an account detail and its edit page', () => {
        expect(currentItems(accounts.detail(ACCOUNT_ID))).toEqual([
            accounts.index,
        ]);
        expect(currentItems(accounts.edit(ACCOUNT_ID))).toEqual([
            accounts.index,
        ]);
    });

    it('is exactly one item on every accounts route', () => {
        const pathnames = [
            ...STATIC_ACCOUNT_ROUTES,
            accounts.detail(ACCOUNT_ID),
            accounts.edit(ACCOUNT_ID),
        ];
        for (const pathname of pathnames) {
            expect(currentItems(pathname)).toHaveLength(1);
        }
        expect(currentItems(accounts.new)).toEqual([accounts.new]);
        expect(currentItems(accounts.index)).toEqual([accounts.index]);
    });

    it('is none outside the accounts area', () => {
        expect(currentItems(routes.propCalculator.simulator)).toEqual([]);
        expect(currentItems('/prop-calculator/accountsx')).toEqual([]);
    });
});
