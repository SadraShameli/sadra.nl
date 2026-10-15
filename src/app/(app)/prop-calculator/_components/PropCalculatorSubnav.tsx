'use client';

import { useMemo } from 'react';

import {
    RouteSubnav,
    type RouteSubnavItem,
} from '~/app/(app)/_components/RouteSubnav';

import { useCalculatorInputs } from './CalculatorProvider';
import { LINKED_TOOL_CATALOG, pageStateBlobsOf } from './toolCatalog';
import { withPageStateBlobsOnly } from './urlState';

export function PropCalculatorSubnav() {
    const { debouncedQuery } = useCalculatorInputs();
    const items = useMemo<readonly RouteSubnavItem[]>(
        () =>
            LINKED_TOOL_CATALOG.map((entry) => ({
                carriesQuery: entry.usesCalculatorInputs,
                href: entry.route,
                icon: entry.icon,
                label: entry.label,
                prefetch: false,
                query: withPageStateBlobsOnly(
                    debouncedQuery,
                    pageStateBlobsOf(entry.id),
                ),
            })),
        [debouncedQuery],
    );
    return (
        <RouteSubnav
            ariaLabel="Prop calculator tools"
            className="app-prop-calculator__subnav lg:[&_svg]:hidden md:[&>div]:flex-wrap"
            items={items}
        />
    );
}
