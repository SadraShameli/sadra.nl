import { type Route } from 'next';

import { sameOriginRoute } from '~/lib/site/routes';

export enum SubnavMatch {
    Exact = 'exact',
    Prefix = 'prefix',
}

export interface SubnavLink {
    carriesQuery?: boolean;
    href: string;
    match?: SubnavMatch;
    pages?: SubnavPages;
    prefetch?: boolean;
    query?: string;
}

export interface SubnavLinkAttributes {
    'aria-current': 'page' | undefined;
    'data-state': 'active' | 'inactive';
}

export interface SubnavPage {
    readonly carriesQuery?: boolean;
    readonly href: string;
    readonly label: string;
    readonly prefetch?: boolean;
    readonly query?: string;
}

export type SubnavPages = readonly [SubnavPage, ...SubnavPage[]];

export function activeSubnavGroup<TLink extends SubnavLink>(
    pathname: string,
    items: readonly TLink[],
): TLink | undefined {
    return items.find(
        (item) => item.pages?.some((page) => page.href === pathname) === true,
    );
}

export function activeSubnavHref(
    pathname: string,
    items: readonly SubnavLink[],
): string | undefined {
    let active: SubnavLink | undefined;
    for (const item of items) {
        if (
            isSubnavItemActive(pathname, item) &&
            (active === undefined || item.href.length > active.href.length)
        ) {
            active = item;
        }
    }
    return active === undefined ? undefined : subnavItemKey(active);
}

export function isSubnavItemActive(
    pathname: string,
    item: SubnavLink,
): boolean {
    if (item.pages?.some((page) => page.href === pathname) === true) {
        return true;
    }
    const match = item.match ?? SubnavMatch.Exact;
    switch (match) {
        case SubnavMatch.Exact: {
            return pathname === item.href;
        }
        case SubnavMatch.Prefix: {
            const prefix = item.href.endsWith('/')
                ? item.href
                : `${item.href}/`;
            return pathname === item.href || pathname.startsWith(prefix);
        }
    }
}

export function subnavGroup(
    label: string,
    pages: SubnavPages,
): SubnavLink & { readonly label: string } {
    return { ...pages[0], label, pages };
}

export function subnavHref(item: SubnavLink, query: string): Route {
    const itemQuery = item.query ?? query;
    const bare = itemQuery.startsWith('?') ? itemQuery.slice(1) : itemQuery;
    return sameOriginRoute(item.href, item.carriesQuery === true ? bare : '');
}

export function subnavItemKey(item: SubnavLink): string {
    return item.href;
}

export function subnavLinkAttributes(
    item: SubnavLink,
    activeHref: string | undefined,
): SubnavLinkAttributes {
    const isActive = subnavItemKey(item) === activeHref;
    return {
        'aria-current': isActive ? 'page' : undefined,
        'data-state': isActive ? 'active' : 'inactive',
    };
}
