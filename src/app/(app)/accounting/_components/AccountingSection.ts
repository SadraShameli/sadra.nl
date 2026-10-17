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

export interface AccountingNavSection {
    readonly href: string;
    readonly label: string;
    readonly section: AccountingSection;
}

export interface AccountingSectionPage {
    readonly lead: string;
    readonly title: string;
}

const PAGES: Readonly<Record<AccountingSection, AccountingSectionPage>> = {
    [AccountingSection.Connections]: {
        lead: 'The bank, card and accounting accounts the importer reads from and posts to. Their secrets are stored encrypted.',
        title: 'Connections',
    },
    [AccountingSection.Dashboard]: {
        lead: 'Pick a start date and the sources, preview the bookings, then post them to the accounting backend.',
        title: 'Run an import',
    },
    [AccountingSection.Ledgers]: {
        lead: 'The ledger accounts held by the connected accounting backend.',
        title: 'Ledgers',
    },
    [AccountingSection.Mutations]: {
        lead: 'The bookings the accounting backend already holds.',
        title: 'Recent mutations',
    },
    [AccountingSection.Rules]: {
        lead: 'How each counterpart is booked: its ledger, its direction and its tax code.',
        title: 'Booking rules',
    },
    [AccountingSection.RunDetail]: {
        lead: 'One import run: its stages, its bookings and what was posted.',
        title: 'Run detail',
    },
    [AccountingSection.Runs]: {
        lead: 'Every import run, with what it previewed and what it posted.',
        title: 'Run history',
    },
    [AccountingSection.Transactions]: {
        lead: 'What each source returned, before any booking rule is applied.',
        title: 'Recent transactions',
    },
};

export const ACCOUNTING_NAV: readonly AccountingNavSection[] = [
    {
        href: routes.accounting.index,
        label: 'Dashboard',
        section: AccountingSection.Dashboard,
    },
    {
        href: routes.accounting.connections,
        label: 'Connections',
        section: AccountingSection.Connections,
    },
    {
        href: routes.accounting.ledgers,
        label: 'Ledgers',
        section: AccountingSection.Ledgers,
    },
    {
        href: routes.accounting.rules,
        label: 'Booking rules',
        section: AccountingSection.Rules,
    },
    {
        href: routes.accounting.transactions,
        label: 'Transactions',
        section: AccountingSection.Transactions,
    },
    {
        href: routes.accounting.mutations,
        label: 'Mutations',
        section: AccountingSection.Mutations,
    },
    {
        href: routes.accounting.runs,
        label: 'Runs',
        section: AccountingSection.Runs,
    },
];

export function accountingSectionPage(
    section: AccountingSection,
): AccountingSectionPage {
    return PAGES[section];
}
