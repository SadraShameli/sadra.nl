import { type RouteSubnavItem } from '~/app/(app)/_components/RouteSubnav';
import { routes } from '~/lib/site/routes';

export const TRADE_CHECKLIST_NAV: readonly RouteSubnavItem[] = [
    { href: routes.tradeChecklist.index, label: 'Checklist' },
    { href: routes.tradeChecklist.journal, label: 'Journal' },
    { href: routes.tradeChecklist.analytics, label: 'Analytics' },
    { href: routes.tradeChecklist.calendar, label: 'Calendar' },
    { href: routes.tradeChecklist.prep, label: 'Pre-market' },
];
