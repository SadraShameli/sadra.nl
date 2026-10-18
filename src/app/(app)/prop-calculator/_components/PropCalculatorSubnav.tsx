'use client';

import { RouteSubnav } from '~/app/(app)/_components/RouteSubnav';

import { useToolNavItems } from './useToolNavItems';

export function PropCalculatorSubnav() {
    const items = useToolNavItems();
    return (
        <RouteSubnav
            ariaLabel="Prop calculator tools"
            className="app-prop-calculator__subnav"
            items={items}
        />
    );
}
