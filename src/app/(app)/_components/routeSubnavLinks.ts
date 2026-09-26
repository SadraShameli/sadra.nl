export enum SubnavMatch {
    Exact = 'exact',
    Prefix = 'prefix',
}

export interface SubnavLink {
    carriesQuery?: boolean;
    href: string;
    match?: SubnavMatch;
    prefetch?: boolean;
}

export interface SubnavLinkAttributes {
    'aria-current': 'page' | undefined;
    'data-state': 'active' | 'inactive';
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

export function subnavHref(item: SubnavLink, query: string): string {
    const bare = query.startsWith('?') ? query.slice(1) : query;
    return bare !== '' && item.carriesQuery === true
        ? `${item.href}?${bare}`
        : item.href;
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
