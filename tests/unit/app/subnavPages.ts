import { type RouteSubnavItem } from '~/app/(app)/_components/RouteSubnav';
import {
    activeSubnavHref,
    subnavLinkAttributes,
    type SubnavPage,
} from '~/app/(app)/_components/routeSubnavLinks';

export function currentSubnavLabels(
    pathname: string,
    items: readonly RouteSubnavItem[],
): string[] {
    const active = activeSubnavHref(pathname, items);
    return items
        .filter(
            (item) =>
                subnavLinkAttributes(item, active)['aria-current'] === 'page',
        )
        .map((item) => item.label);
}

export function subnavPages(items: readonly RouteSubnavItem[]): SubnavPage[] {
    return items.flatMap(
        (item) => item.pages ?? { href: item.href, label: item.label },
    );
}
