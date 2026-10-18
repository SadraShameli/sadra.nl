'use client';

import { RouteSubnav } from '~/app/(app)/_components/RouteSubnav';

import { TRADE_CHECKLIST_NAV } from './tradeChecklistNav';

export function TradeChecklistSubnav() {
    return (
        <RouteSubnav
            className="app-trade-checklist__subnav"
            items={TRADE_CHECKLIST_NAV}
        />
    );
}
