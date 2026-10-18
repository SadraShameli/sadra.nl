'use client';

import {
    RouteSubnav,
    type RouteSubnavItem,
} from '~/app/(app)/_components/RouteSubnav';

import { useCalculatorInputs } from './CalculatorProvider';
import { LINKED_TOOL_CATALOG, pageStateBlobsOf } from './toolCatalog';
import { withPageStateBlobsOnly } from './urlState';

export function PropCalculatorSubnav() {
    const { debouncedQuery } = useCalculatorInputs();
    const items: readonly RouteSubnavItem[] = LINKED_TOOL_CATALOG.map(
        (entry) => ({
            carriesQuery: entry.usesCalculatorInputs,
            href: entry.route,
            label: entry.label,
            prefetch: false,
            query: withPageStateBlobsOnly(
                debouncedQuery,
                pageStateBlobsOf(entry.id),
            ),
        }),
    );
    return (
        <RouteSubnav
            ariaLabel="Prop calculator tools"
            className="app-prop-calculator__subnav"
            items={items}
        />
    );
}
