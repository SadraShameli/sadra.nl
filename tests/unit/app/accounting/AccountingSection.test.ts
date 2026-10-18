import { describe, expect, it } from 'vitest';

import {
    AccountingSection,
    accountingSectionPage,
} from '~/app/(app)/accounting/_components/AccountingSection';
import { routes } from '~/lib/site/routes';

describe('accounting page headers', () => {
    it('links the run detail page back to the run history', () => {
        expect(
            accountingSectionPage(AccountingSection.RunDetail).backLink,
        ).toEqual({ href: routes.accounting.runs, label: 'Run history' });
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
});
