import {
    BookOpen,
    CalendarCheck,
    CirclePlus,
    Crosshair,
    FileUp,
    Layers,
    LayoutDashboard,
    Receipt,
    ShoppingCart,
} from 'lucide-react';

import { type RouteSubnavItem } from '~/app/(app)/_components/RouteSubnav';
import { SubnavMatch } from '~/app/(app)/_components/routeSubnavLinks';
import { routes } from '~/lib/site/routes';

const { accounts } = routes.propCalculator;

export const ACCOUNTS_NAV_ITEMS: readonly RouteSubnavItem[] = [
    {
        href: accounts.index,
        icon: LayoutDashboard,
        label: 'Overview',
        match: SubnavMatch.Prefix,
    },
    { href: accounts.new, icon: CirclePlus, label: 'Add account' },
    { href: accounts.review, icon: CalendarCheck, label: 'Weekly review' },
    { href: accounts.ledger, icon: Receipt, label: 'Ledger' },
    { href: accounts.import, icon: FileUp, label: 'Import' },
    { href: accounts.rulebook, icon: BookOpen, label: 'Rulebook' },
    { href: accounts.copyGroups, icon: Layers, label: 'Copy groups' },
    { href: accounts.nextSlot, icon: ShoppingCart, label: 'Next slot' },
    { href: accounts.edge, icon: Crosshair, label: 'Edge' },
];
