import type { CurrencyCode } from '~/lib/accounting/core/types';

import { currencyCodeSchema } from '~/lib/accounting/core/currency';
import { LedgerId } from '~/lib/accounting/core/ids';

enum CredentialLabel {
    Rise = 'Main - Rise',
    WisePersonal = 'Main - Wise Personal',
}

export interface SeedBankAccount {
    currency: CurrencyCode;
    ledger: SeedLedger;
}

export interface SeededBankAccounts {
    accounts: readonly SeedBankAccount[];
    isOverride: boolean;
}

interface SeedLedger {
    id: LedgerId;
    label: string;
}

const EUR = currencyCodeSchema.parse('EUR');
const USD = currencyCodeSchema.parse('USD');

const WISE_EUR: SeedLedger = {
    id: LedgerId('51974018'),
    label: '0005 Wise Business - EUR',
};
const WISE_USD: SeedLedger = {
    id: LedgerId('51974061'),
    label: '0006 Wise Business - USD',
};
const WISE_PERSONAL: SeedLedger = {
    id: LedgerId('51974064'),
    label: '0007 Wise',
};
const CRYPTO_WALLET: SeedLedger = {
    id: LedgerId('54782895'),
    label: '0008 Crypto wallet - Coinbase',
};

const DEFAULT_BANK_ACCOUNTS: readonly SeedBankAccount[] = [
    { currency: EUR, ledger: WISE_EUR },
    { currency: USD, ledger: WISE_USD },
];

const OVERRIDES_BY_LABEL = new Map<CredentialLabel, readonly SeedBankAccount[]>(
    [
        [CredentialLabel.Rise, [{ currency: USD, ledger: CRYPTO_WALLET }]],
        [
            CredentialLabel.WisePersonal,
            [
                { currency: EUR, ledger: WISE_PERSONAL },
                { currency: USD, ledger: WISE_PERSONAL },
            ],
        ],
    ],
);

export function seedBankAccountsFor(label: string): SeededBankAccounts {
    const override = isCredentialLabel(label)
        ? OVERRIDES_BY_LABEL.get(label)
        : undefined;
    return override === undefined
        ? { accounts: DEFAULT_BANK_ACCOUNTS, isOverride: false }
        : { accounts: override, isOverride: true };
}

function isCredentialLabel(label: string): label is CredentialLabel {
    return Object.values<string>(CredentialLabel).includes(label);
}
