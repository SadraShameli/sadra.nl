'use client';

import {
    ArrowLeftRight,
    BookOpen,
    Filter,
    KeyRound,
    LayoutDashboard,
    ListChecks,
} from 'lucide-react';

import {
    RouteSubnav,
    type RouteSubnavItem,
} from '~/app/(app)/_components/RouteSubnav';
import { routes } from '~/lib/site/routes';

const ITEMS: readonly RouteSubnavItem[] = [
    {
        href: routes.accounting.index,
        icon: LayoutDashboard,
        label: 'Dashboard',
    },
    {
        href: routes.accounting.connections,
        icon: KeyRound,
        label: 'Connections',
    },
    {
        href: routes.accounting.ledgers,
        icon: BookOpen,
        label: 'Ledgers',
    },
    {
        href: routes.accounting.rules,
        icon: Filter,
        label: 'Booking rules',
    },
    {
        href: routes.accounting.transactions,
        icon: ArrowLeftRight,
        label: 'Transactions',
    },
    {
        href: routes.accounting.mutations,
        icon: ListChecks,
        label: 'Mutations',
    },
];

export function AccountingSubnav() {
    return <RouteSubnav className="app-accounting__subnav" items={ITEMS} />;
}
