import { type RouteSubnavItem } from '~/app/(app)/_components/RouteSubnav';
import {
    subnavGroup,
    SubnavMatch,
} from '~/app/(app)/_components/routeSubnavLinks';
import { routes } from '~/lib/site/routes';

const { accounts } = routes.propCalculator;

export const ACCOUNTS_NAV_ITEMS: readonly RouteSubnavItem[] = [
    { href: accounts.index, label: 'Overview', match: SubnavMatch.Prefix },
    { href: accounts.review, label: 'Weekly review' },
    { href: accounts.ledger, label: 'Ledger' },
    subnavGroup('Planning', [
        { href: accounts.nextSlot, label: 'Next slot' },
        { href: accounts.rounds, label: 'Rounds' },
        { href: accounts.copyGroups, label: 'Copy groups' },
        { href: accounts.edge, label: 'Edge' },
    ]),
    subnavGroup('Setup', [
        { href: accounts.rulebook, label: 'Rulebook' },
        { href: accounts.firms, label: 'Firms' },
        { href: accounts.import, label: 'Import' },
    ]),
];
