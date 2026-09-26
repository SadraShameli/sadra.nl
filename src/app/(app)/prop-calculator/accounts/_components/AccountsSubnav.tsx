'use client';

import { RouteSubnav } from '~/app/(app)/_components/RouteSubnav';

import { ACCOUNTS_NAV_ITEMS } from './accountsNavItems';

export function AccountsSubnav() {
    return (
        <RouteSubnav
            ariaLabel="Prop accounts"
            className="app-prop-accounts__subnav"
            items={ACCOUNTS_NAV_ITEMS}
        />
    );
}
