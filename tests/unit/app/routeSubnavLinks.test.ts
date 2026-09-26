import { describe, expect, it } from 'vitest';

import {
    activeSubnavHref,
    isSubnavItemActive,
    subnavHref,
    subnavItemKey,
    subnavLinkAttributes,
    SubnavMatch,
} from '~/app/(app)/_components/routeSubnavLinks';

describe('isSubnavItemActive', () => {
    it('matches the exact href by default', () => {
        expect(isSubnavItemActive('/a', { href: '/a' })).toBe(true);
    });

    it('does not match a child route by default', () => {
        expect(isSubnavItemActive('/a/b', { href: '/a' })).toBe(false);
    });

    it('does not match a sibling or the root by default', () => {
        expect(isSubnavItemActive('/b', { href: '/a' })).toBe(false);
        expect(isSubnavItemActive('/', { href: '/a' })).toBe(false);
    });

    it('treats an explicit exact match like the default', () => {
        expect(
            isSubnavItemActive('/a', { href: '/a', match: SubnavMatch.Exact }),
        ).toBe(true);
        expect(
            isSubnavItemActive('/a/b', {
                href: '/a',
                match: SubnavMatch.Exact,
            }),
        ).toBe(false);
    });

    it('matches a child route with a prefix match', () => {
        expect(
            isSubnavItemActive('/a/b', {
                href: '/a',
                match: SubnavMatch.Prefix,
            }),
        ).toBe(true);
        expect(
            isSubnavItemActive('/a/b/c', {
                href: '/a',
                match: SubnavMatch.Prefix,
            }),
        ).toBe(true);
    });

    it('matches the href itself with a prefix match', () => {
        expect(
            isSubnavItemActive('/a', { href: '/a', match: SubnavMatch.Prefix }),
        ).toBe(true);
    });

    it('does not match a route that only shares leading characters with a prefix match', () => {
        expect(
            isSubnavItemActive('/ab', {
                href: '/a',
                match: SubnavMatch.Prefix,
            }),
        ).toBe(false);
        expect(
            isSubnavItemActive('/prop-calculator/accounts-old', {
                href: '/prop-calculator/accounts',
                match: SubnavMatch.Prefix,
            }),
        ).toBe(false);
    });

    it('does not match a parent route with a prefix match', () => {
        expect(
            isSubnavItemActive('/a', {
                href: '/a/b',
                match: SubnavMatch.Prefix,
            }),
        ).toBe(false);
    });

    it('matches every route under a root href with a prefix match', () => {
        expect(
            isSubnavItemActive('/a', { href: '/', match: SubnavMatch.Prefix }),
        ).toBe(true);
        expect(
            isSubnavItemActive('/', { href: '/', match: SubnavMatch.Prefix }),
        ).toBe(true);
    });

    it('does not match an empty pathname', () => {
        expect(isSubnavItemActive('', { href: '/a' })).toBe(false);
        expect(
            isSubnavItemActive('', { href: '/a', match: SubnavMatch.Prefix }),
        ).toBe(false);
    });

    it('compares case-sensitively and without decoding special characters', () => {
        expect(isSubnavItemActive('/A', { href: '/a' })).toBe(false);
        expect(
            isSubnavItemActive('/caf%C3%A9/x', {
                href: '/caf%C3%A9',
                match: SubnavMatch.Prefix,
            }),
        ).toBe(true);
    });
});

describe('subnavItemKey', () => {
    it('equals the item base href', () => {
        expect(subnavItemKey({ href: '/a' })).toBe('/a');
        expect(
            subnavItemKey({ href: '/prop-calculator/accounts/ledger' }),
        ).toBe('/prop-calculator/accounts/ledger');
    });

    it('does not depend on the match mode', () => {
        expect(subnavItemKey({ href: '/a', match: SubnavMatch.Prefix })).toBe(
            subnavItemKey({ href: '/a' }),
        );
    });

    it('gives distinct keys to the items of every existing subnav shape', () => {
        const items = [
            { href: '/a' },
            { href: '/a/b', match: SubnavMatch.Prefix },
            { href: '/ab' },
        ];
        const keys = new Set(items.map((item) => subnavItemKey(item)));
        expect(keys.size).toBe(items.length);
    });
});

describe('activeSubnavHref', () => {
    it('returns the href of the single matching item', () => {
        expect(
            activeSubnavHref('/a/b', [
                { href: '/a' },
                { href: '/a/b' },
                { href: '/a/c' },
            ]),
        ).toBe('/a/b');
    });

    it('returns undefined when no item matches', () => {
        expect(
            activeSubnavHref('/z', [{ href: '/a' }, { href: '/b' }]),
        ).toBeUndefined();
        expect(activeSubnavHref('/a', [])).toBeUndefined();
    });

    it('picks the exact child over a prefix parent on the child route', () => {
        expect(
            activeSubnavHref('/prop-calculator/accounts/ledger', [
                {
                    href: '/prop-calculator/accounts',
                    match: SubnavMatch.Prefix,
                },
                { href: '/prop-calculator/accounts/ledger' },
            ]),
        ).toBe('/prop-calculator/accounts/ledger');
    });

    it('keeps the prefix parent active on a child route with no own item', () => {
        expect(
            activeSubnavHref('/prop-calculator/accounts/42/edit', [
                {
                    href: '/prop-calculator/accounts',
                    match: SubnavMatch.Prefix,
                },
                { href: '/prop-calculator/accounts/ledger' },
            ]),
        ).toBe('/prop-calculator/accounts');
    });

    it('picks the longest of several nested prefix matches regardless of order', () => {
        const items = [
            { href: '/a/b', match: SubnavMatch.Prefix },
            { href: '/', match: SubnavMatch.Prefix },
            { href: '/a', match: SubnavMatch.Prefix },
        ];
        expect(activeSubnavHref('/a/b/c', items)).toBe('/a/b');
        expect(activeSubnavHref('/a/b/c', items.toReversed())).toBe('/a/b');
        expect(activeSubnavHref('/a/x', items)).toBe('/a');
        expect(activeSubnavHref('/x', items)).toBe('/');
    });
});

describe('subnavLinkAttributes', () => {
    it('marks the active item as the current page', () => {
        expect(subnavLinkAttributes({ href: '/a' }, '/a')).toEqual({
            'aria-current': 'page',
            'data-state': 'active',
        });
    });

    it('leaves aria-current off an inactive item', () => {
        expect(subnavLinkAttributes({ href: '/a' }, '/a/b')).toEqual({
            'aria-current': undefined,
            'data-state': 'inactive',
        });
    });

    it('marks no item current when there is no active href', () => {
        expect(subnavLinkAttributes({ href: '/a' }, undefined)).toEqual({
            'aria-current': undefined,
            'data-state': 'inactive',
        });
    });

    it('marks a prefix-matched parent item as the current page on a child route', () => {
        const parent = { href: '/a', match: SubnavMatch.Prefix };
        expect(
            subnavLinkAttributes(parent, activeSubnavHref('/a/b', [parent]))[
                'aria-current'
            ],
        ).toBe('page');
    });

    it('marks exactly one item current among sibling items', () => {
        const items = [{ href: '/a' }, { href: '/a/b' }, { href: '/a/c' }];
        const activeHref = activeSubnavHref('/a/b', items);
        const current = items.filter(
            (item) =>
                subnavLinkAttributes(item, activeHref)['aria-current'] ===
                'page',
        );
        expect(current).toEqual([{ href: '/a/b' }]);
    });

    it('marks only the child item current when a prefix parent sibling also matches', () => {
        const pathname = '/prop-calculator/accounts/ledger';
        const items = [
            { href: '/prop-calculator/accounts', match: SubnavMatch.Prefix },
            { href: '/prop-calculator/accounts/ledger' },
        ];
        const activeHref = activeSubnavHref(pathname, items);
        const current = items.filter(
            (item) =>
                subnavLinkAttributes(item, activeHref)['data-state'] ===
                'active',
        );
        expect(current).toEqual([{ href: '/prop-calculator/accounts/ledger' }]);
    });
});

describe('subnavHref', () => {
    it('appends the query to an item that opts in', () => {
        expect(
            subnavHref(
                { carriesQuery: true, href: '/prop-calculator/analysis' },
                'firm=apex&wr=0.400',
            ),
        ).toBe('/prop-calculator/analysis?firm=apex&wr=0.400');
    });

    it('leaves an item without the opt-in on its base href', () => {
        expect(
            subnavHref({ href: '/prop-calculator/rules' }, 'firm=apex'),
        ).toBe('/prop-calculator/rules');
        expect(
            subnavHref(
                { carriesQuery: false, href: '/prop-calculator/rules' },
                'firm=apex',
            ),
        ).toBe('/prop-calculator/rules');
    });

    it('gives the base href for an empty query or a bare question mark', () => {
        expect(subnavHref({ carriesQuery: true, href: '/a' }, '')).toBe('/a');
        expect(subnavHref({ carriesQuery: true, href: '/a' }, '?')).toBe('/a');
    });

    it('does not double a leading question mark', () => {
        expect(subnavHref({ carriesQuery: true, href: '/a' }, '?x=1')).toBe(
            '/a?x=1',
        );
    });

    it('keeps the item key and the active resolution on the base href', () => {
        const item = {
            carriesQuery: true,
            href: '/prop-calculator/sizing',
            prefetch: false,
        };
        expect(subnavHref(item, 'x=1')).toBe('/prop-calculator/sizing?x=1');
        expect(subnavItemKey(item)).toBe('/prop-calculator/sizing');
        expect(
            activeSubnavHref('/prop-calculator/sizing', [
                item,
                { carriesQuery: true, href: '/prop-calculator/analysis' },
            ]),
        ).toBe('/prop-calculator/sizing');
    });

    it('marks exactly one current item across a tools list with query-carrying items', () => {
        const items = [
            { carriesQuery: true, href: '/prop-calculator/simulator' },
            { carriesQuery: true, href: '/prop-calculator/analysis' },
            { href: '/prop-calculator/rules' },
        ];
        const activeHref = activeSubnavHref('/prop-calculator/analysis', items);
        const current = items.filter(
            (item) =>
                subnavLinkAttributes(item, activeHref)['aria-current'] ===
                'page',
        );
        expect(current.map((item) => item.href)).toEqual([
            '/prop-calculator/analysis',
        ]);
    });
});
