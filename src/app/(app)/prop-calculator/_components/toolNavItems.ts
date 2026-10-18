import { type RouteSubnavItem } from '~/app/(app)/_components/RouteSubnav';
import {
    subnavGroup,
    type SubnavPage,
} from '~/app/(app)/_components/routeSubnavLinks';

import {
    LINKED_TOOL_CATALOG,
    pageStateBlobsOf,
    type ToolCatalogEntry,
    type ToolGroupTools,
    toolsByGroup,
} from './toolCatalog';
import { withPageStateBlobsOnly } from './urlState';

export function toolNavItems(query: string): readonly RouteSubnavItem[] {
    return toolsByGroup(LINKED_TOOL_CATALOG).map((group) =>
        toolGroupNavItem(group, query),
    );
}

export function toolNavPage(
    entry: ToolCatalogEntry,
    query: string,
): SubnavPage {
    return {
        carriesQuery: entry.usesCalculatorInputs,
        href: entry.route,
        label: entry.label,
        prefetch: false,
        query: withPageStateBlobsOnly(query, pageStateBlobsOf(entry.id)),
    };
}

function toolGroupNavItem(
    { label, tools }: ToolGroupTools,
    query: string,
): RouteSubnavItem {
    const [first, ...rest] = tools;
    const firstPage = toolNavPage(first, query);
    return rest.length === 0
        ? firstPage
        : subnavGroup(label, [
              firstPage,
              ...rest.map((entry) => toolNavPage(entry, query)),
          ]);
}
