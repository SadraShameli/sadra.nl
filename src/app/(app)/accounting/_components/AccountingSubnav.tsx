'use client';

import { RouteSubnav } from '~/app/(app)/_components/RouteSubnav';

import { ACCOUNTING_NAV } from './AccountingSection';

export function AccountingSubnav() {
    return (
        <RouteSubnav
            className="app-accounting__subnav"
            items={ACCOUNTING_NAV}
        />
    );
}
