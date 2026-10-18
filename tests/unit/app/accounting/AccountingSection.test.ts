import { describe, expect, it } from 'vitest';

import { activeSubnavGroup } from '~/app/(app)/_components/routeSubnavLinks';
import {
    ACCOUNTING_NAV,
    AccountingSection,
    accountingSectionPage,
} from '~/app/(app)/accounting/_components/AccountingSection';
import { compareText } from '~/lib/prop-accounts';
import { routes } from '~/lib/site/routes';

import { currentSubnavLabels, subnavPages } from '../subnavPages';

const { accounting } = routes;

const STATIC_ACCOUNTING_ROUTES: readonly string[] = Object.values(
    accounting,
).filter((value) => typeof value === 'string');

function currentLabels(pathname: string): string[] {
    return currentSubnavLabels(pathname, ACCOUNTING_NAV);
}

describe('accounting page headers', () => {
    it('links the run detail page back to the runs page, under the runs page name', () => {
        expect(
            accountingSectionPage(AccountingSection.RunDetail).backLink,
        ).toEqual({ href: accounting.runs, label: 'Runs' });
        expect(
            accountingSectionPage(AccountingSection.RunDetail).backLink?.label,
        ).toBe(accountingSectionPage(AccountingSection.Runs).title);
    });

    it('gives every other section no back link, so it keeps the importer eyebrow', () => {
        const others = Object.values(AccountingSection).filter(
            (section) => section !== AccountingSection.RunDetail,
        );

        for (const section of others) {
            expect(accountingSectionPage(section).backLink, section).toBe(
                undefined,
            );
        }
    });

    it('names each page with one short title', () => {
        expect(
            [
                AccountingSection.Dashboard,
                AccountingSection.Runs,
                AccountingSection.Transactions,
                AccountingSection.Mutations,
                AccountingSection.Ledgers,
                AccountingSection.Rules,
                AccountingSection.Connections,
            ].map((section) => accountingSectionPage(section).title),
        ).toEqual([
            'Import',
            'Runs',
            'Transactions',
            'Mutations',
            'Ledgers',
            'Booking rules',
            'Connections',
        ]);
    });
});

describe('ACCOUNTING_NAV', () => {
    it('lists the short section nav in order', () => {
        expect(ACCOUNTING_NAV.map((item) => item.label)).toEqual([
            'Import',
            'Runs',
            'Data',
            'Setup',
        ]);
        expect(ACCOUNTING_NAV.map((item) => item.href)).toEqual([
            accounting.index,
            accounting.runs,
            accounting.transactions,
            accounting.rules,
        ]);
    });

    it('groups the data pages and the setup pages', () => {
        expect(
            ACCOUNTING_NAV.filter((item) => item.pages !== undefined).map(
                (item) => [
                    item.label,
                    item.pages?.map((page) => [page.label, page.href]),
                ],
            ),
        ).toEqual([
            [
                'Data',
                [
                    ['Transactions', accounting.transactions],
                    ['Mutations', accounting.mutations],
                    ['Ledgers', accounting.ledgers],
                ],
            ],
            [
                'Setup',
                [
                    ['Booking rules', accounting.rules],
                    ['Connections', accounting.connections],
                ],
            ],
        ]);
    });

    it('labels every page with the title its header shows', () => {
        const titleByHref = new Map<string, string>([
            [
                accounting.connections,
                accountingSectionPage(AccountingSection.Connections).title,
            ],
            [
                accounting.index,
                accountingSectionPage(AccountingSection.Dashboard).title,
            ],
            [
                accounting.ledgers,
                accountingSectionPage(AccountingSection.Ledgers).title,
            ],
            [
                accounting.mutations,
                accountingSectionPage(AccountingSection.Mutations).title,
            ],
            [
                accounting.rules,
                accountingSectionPage(AccountingSection.Rules).title,
            ],
            [
                accounting.runs,
                accountingSectionPage(AccountingSection.Runs).title,
            ],
            [
                accounting.transactions,
                accountingSectionPage(AccountingSection.Transactions).title,
            ],
        ]);
        for (const page of subnavPages(ACCOUNTING_NAV)) {
            expect(page.label, page.href).toBe(titleByHref.get(page.href));
        }
    });

    it('reaches every static accounting page exactly once', () => {
        const hrefs = subnavPages(ACCOUNTING_NAV).map((page) => page.href);
        expect(new Set(hrefs).size).toBe(hrefs.length);
        expect(hrefs.toSorted(compareText)).toEqual(
            [...STATIC_ACCOUNTING_ROUTES].toSorted(compareText),
        );
    });

    it('marks exactly one item current on every static accounting page', () => {
        for (const pathname of STATIC_ACCOUNTING_ROUTES) {
            expect(currentLabels(pathname), pathname).toHaveLength(1);
        }
        expect(currentLabels(accounting.mutations)).toEqual(['Data']);
        expect(currentLabels(accounting.connections)).toEqual(['Setup']);
        expect(currentLabels(accounting.index)).toEqual(['Import']);
    });

    it('shows group tabs only on a grouped page', () => {
        expect(
            activeSubnavGroup(accounting.ledgers, ACCOUNTING_NAV)?.label,
        ).toBe('Data');
        expect(activeSubnavGroup(accounting.rules, ACCOUNTING_NAV)?.label).toBe(
            'Setup',
        );
        expect(activeSubnavGroup(accounting.runs, ACCOUNTING_NAV)).toBe(
            undefined,
        );
        expect(
            activeSubnavGroup(accounting.run('run-1'), ACCOUNTING_NAV),
        ).toBeUndefined();
    });
});
