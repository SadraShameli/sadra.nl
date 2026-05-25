'use client';

import {
    BarChart3,
    Calendar as CalendarIcon,
    CheckSquare,
    ClipboardList,
    Search,
} from 'lucide-react';

import {
    RouteSubnav,
    type RouteSubnavItem,
} from '~/app/(app)/_components/RouteSubnav';
import { routes } from '~/lib/site/routes';

const ITEMS: readonly RouteSubnavItem[] = [
    {
        href: routes.tradeChecklist.index,
        icon: ClipboardList,
        label: 'Checklist',
    },
    {
        href: routes.tradeChecklist.journal,
        icon: Search,
        label: 'Journal',
    },
    {
        href: routes.tradeChecklist.analytics,
        icon: BarChart3,
        label: 'Analytics',
    },
    {
        href: routes.tradeChecklist.calendar,
        icon: CalendarIcon,
        label: 'Calendar',
    },
    {
        href: routes.tradeChecklist.prep,
        icon: CheckSquare,
        label: 'Pre-market',
    },
];

export function TradeChecklistSubnav() {
    return (
        <RouteSubnav className="app-trade-checklist__subnav" items={ITEMS} />
    );
}
