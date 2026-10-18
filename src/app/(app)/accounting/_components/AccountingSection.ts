import { type RouteSubnavItem } from '~/app/(app)/_components/RouteSubnav';
import {
    subnavGroup,
    type SubnavPage,
} from '~/app/(app)/_components/routeSubnavLinks';
import { type PageHeaderBackLink } from '~/components/PageHeader';
import { routes } from '~/lib/site/routes';

export enum AccountingSection {
    Connections = 'connections',
    Dashboard = 'dashboard',
    Ledgers = 'ledgers',
    Mutations = 'mutations',
    Rules = 'rules',
    RunDetail = 'run-detail',
    Runs = 'runs',
    Transactions = 'transactions',
}

export const ACCOUNTING_EYEBROW = 'Accounting importer';

export interface AccountingSectionPage {
    readonly backLink?: PageHeaderBackLink;
    readonly lead: string;
    readonly title: string;
}

const RUNS_PAGE: AccountingSectionPage = {
    lead: 'Every import run, with what it previewed and what it posted.',
    title: 'Runs',
};

const PAGES: Readonly<Record<AccountingSection, AccountingSectionPage>> = {
    [AccountingSection.Connections]: {
        lead: 'The bank, card and accounting accounts the importer reads from and posts to. Their secrets are stored encrypted.',
        title: 'Connections',
    },
    [AccountingSection.Dashboard]: {
        lead: 'Pick a start date and the sources, preview the bookings, then post them to the accounting backend.',
        title: 'Import',
    },
    [AccountingSection.Ledgers]: {
        lead: 'The ledger accounts held by the connected accounting backend.',
        title: 'Ledgers',
    },
    [AccountingSection.Mutations]: {
        lead: 'The bookings the accounting backend already holds.',
        title: 'Mutations',
    },
    [AccountingSection.Rules]: {
        lead: 'How each counterpart is booked: its ledger, its direction and its tax code.',
        title: 'Booking rules',
    },
    [AccountingSection.RunDetail]: {
        backLink: { href: routes.accounting.runs, label: RUNS_PAGE.title },
        lead: 'One import run: its stages, its bookings and what was posted.',
        title: 'Run detail',
    },
    [AccountingSection.Runs]: RUNS_PAGE,
    [AccountingSection.Transactions]: {
        lead: 'What each source returned, before any booking rule is applied.',
        title: 'Transactions',
    },
};

export function accountingSectionPage(
    section: AccountingSection,
): AccountingSectionPage {
    return PAGES[section];
}

function sectionNavPage(section: AccountingSection, href: string): SubnavPage {
    return { href, label: accountingSectionPage(section).title };
}

export const ACCOUNTING_NAV: readonly RouteSubnavItem[] = [
    sectionNavPage(AccountingSection.Dashboard, routes.accounting.index),
    sectionNavPage(AccountingSection.Runs, routes.accounting.runs),
    subnavGroup('Data', [
        sectionNavPage(
            AccountingSection.Transactions,
            routes.accounting.transactions,
        ),
        sectionNavPage(
            AccountingSection.Mutations,
            routes.accounting.mutations,
        ),
        sectionNavPage(AccountingSection.Ledgers, routes.accounting.ledgers),
    ]),
    subnavGroup('Setup', [
        sectionNavPage(AccountingSection.Rules, routes.accounting.rules),
        sectionNavPage(
            AccountingSection.Connections,
            routes.accounting.connections,
        ),
    ]),
];
