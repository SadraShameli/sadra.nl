import {
    BookOpen,
    Building2,
    CalendarCheck,
    CirclePlus,
    Crosshair,
    FileUp,
    Layers,
    LayoutDashboard,
    Receipt,
    Repeat,
    ShoppingCart,
} from 'lucide-react';

import { type RouteSubnavItem } from '~/app/(app)/_components/RouteSubnav';
import { SubnavMatch } from '~/app/(app)/_components/routeSubnavLinks';
import { routes } from '~/lib/site/routes';

const { accounts } = routes.propCalculator;

interface AccountsNavEntry extends RouteSubnavItem {
    hasPage: boolean;
}

export const ACCOUNTS_NAV_CATALOG: readonly AccountsNavEntry[] = [
    {
        hasPage: true,
        href: accounts.index,
        icon: LayoutDashboard,
        label: 'Overview',
        match: SubnavMatch.Prefix,
    },
    {
        hasPage: true,
        href: accounts.new,
        icon: CirclePlus,
        label: 'Add account',
    },
    {
        hasPage: true,
        href: accounts.review,
        icon: CalendarCheck,
        label: 'Weekly review',
    },
    { hasPage: true, href: accounts.ledger, icon: Receipt, label: 'Ledger' },
    { hasPage: true, href: accounts.import, icon: FileUp, label: 'Import' },
    {
        hasPage: true,
        href: accounts.rulebook,
        icon: BookOpen,
        label: 'Rulebook',
    },
    {
        hasPage: true,
        href: accounts.copyGroups,
        icon: Layers,
        label: 'Copy groups',
    },
    {
        hasPage: true,
        href: accounts.nextSlot,
        icon: ShoppingCart,
        label: 'Next slot',
    },
    { hasPage: true, href: accounts.edge, icon: Crosshair, label: 'Edge' },
    { hasPage: true, href: accounts.rounds, icon: Repeat, label: 'Rounds' },
    {
        hasPage: true,
        href: accounts.firms,
        icon: Building2,
        label: 'Firms',
    },
];

export const ACCOUNTS_NAV_ITEMS: readonly RouteSubnavItem[] =
    ACCOUNTS_NAV_CATALOG.filter((entry) => entry.hasPage);
