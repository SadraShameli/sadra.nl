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
        label: 'Overview',
        match: SubnavMatch.Prefix,
    },
    {
        hasPage: true,
        href: accounts.new,
        label: 'Add account',
    },
    {
        hasPage: true,
        href: accounts.review,
        label: 'Weekly review',
    },
    { hasPage: true, href: accounts.ledger, label: 'Ledger' },
    { hasPage: true, href: accounts.import, label: 'Import' },
    {
        hasPage: true,
        href: accounts.rulebook,
        label: 'Rulebook',
    },
    {
        hasPage: true,
        href: accounts.copyGroups,
        label: 'Copy groups',
    },
    {
        hasPage: true,
        href: accounts.nextSlot,
        label: 'Next slot',
    },
    { hasPage: true, href: accounts.edge, label: 'Edge' },
    { hasPage: true, href: accounts.rounds, label: 'Rounds' },
    {
        hasPage: true,
        href: accounts.firms,
        label: 'Firms',
    },
];

export const ACCOUNTS_NAV_ITEMS: readonly RouteSubnavItem[] =
    ACCOUNTS_NAV_CATALOG.filter((entry) => entry.hasPage);
