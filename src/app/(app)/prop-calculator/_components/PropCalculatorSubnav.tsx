'use client';

import {
    RouteSubnav,
    type RouteSubnavItem,
} from '~/app/(app)/_components/RouteSubnav';

import { useCalculatorInputs } from './CalculatorProvider';
import { LINKED_TOOL_CATALOG } from './toolCatalog';

const ITEMS: readonly RouteSubnavItem[] = LINKED_TOOL_CATALOG.map((entry) => ({
    carriesQuery: entry.usesCalculatorInputs,
    href: entry.route,
    icon: entry.icon,
    label: entry.label,
    prefetch: false,
}));

export function PropCalculatorSubnav() {
    const { debouncedQuery } = useCalculatorInputs();
    return (
        <RouteSubnav
            ariaLabel="Prop calculator tools"
            className="app-prop-calculator__subnav"
            items={ITEMS}
            query={debouncedQuery}
        />
    );
}
