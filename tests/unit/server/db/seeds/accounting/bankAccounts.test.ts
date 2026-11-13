import { describe, expect, it } from 'vitest';

import { seedBankAccountsFor } from '~/server/db/seeds/accounting/bankAccounts';

function ledgerLabels(label: string): Record<string, string> {
    return Object.fromEntries(
        seedBankAccountsFor(label).accounts.map((account) => [
            account.currency,
            account.ledger.label,
        ]),
    );
}

describe('seedBankAccountsFor', () => {
    it('gives every other credential the business EUR and USD Wise accounts without overriding', () => {
        const result = seedBankAccountsFor('Main');

        expect(result.isOverride).toBe(false);
        expect(ledgerLabels('Main')).toEqual({
            EUR: '0005 Wise Business - EUR',
            USD: '0006 Wise Business - USD',
        });
    });

    it('books the personal Wise credential on the personal Wise ledger in both currencies', () => {
        expect(seedBankAccountsFor('Main - Wise Personal').isOverride).toBe(
            true,
        );
        expect(ledgerLabels('Main - Wise Personal')).toEqual({
            EUR: '0007 Wise',
            USD: '0007 Wise',
        });
    });

    it('books Rise USD on the crypto wallet ledger and leaves EUR alone', () => {
        expect(seedBankAccountsFor('Main - Rise').isOverride).toBe(true);
        expect(ledgerLabels('Main - Rise')).toEqual({
            USD: '0008 Crypto wallet - Coinbase',
        });
    });

    it('does not apply an override to a label that only looks similar', () => {
        expect(seedBankAccountsFor('main - rise').isOverride).toBe(false);
        expect(seedBankAccountsFor('Main - Rise ').isOverride).toBe(false);
    });
});
