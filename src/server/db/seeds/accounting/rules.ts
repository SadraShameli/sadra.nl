import { eq } from 'drizzle-orm';

import type {
    BookingDirection,
    CurrencyCode,
} from '~/lib/accounting/core/types';
import type { VatCode } from '~/lib/accounting/providers/eboekhouden/enums';

import { currencyCodeSchema } from '~/lib/accounting/core/currency';
import {
    accountingBankAccount,
    accountingCredential,
    accountingRule,
    db,
} from '~/server/db';
import { DatabaseSeeder } from '~/server/db/types';

interface LedgerReference {
    id: number;
    label: string;
}

const FUNDED: LedgerReference = {
    id: 46_580_770,
    label: '0001 Funded accounts',
};
const SOFTWARE: LedgerReference = {
    id: 46_581_706,
    label: '0002 Trading Software',
};
const HARDWARE: LedgerReference = {
    id: 46_724_292,
    label: '0003 Trading Hardware',
};
const PAYOUTS: LedgerReference = { id: 48_217_305, label: '0004 Payouts' };
const WISE_EUR: LedgerReference = {
    id: 51_974_018,
    label: '0005 Wise Business - EUR',
};
const WISE_USD: LedgerReference = {
    id: 51_974_061,
    label: '0006 Wise Business - USD',
};

const BANK_ACCOUNTS: { currency: CurrencyCode; ledger: LedgerReference }[] = [
    { currency: currencyCodeSchema.parse('EUR'), ledger: WISE_EUR },
    { currency: currencyCodeSchema.parse('USD'), ledger: WISE_USD },
];

interface SeedRule {
    direction: BookingDirection;
    display: string;
    ledger: LedgerReference;
    match: string;
    vatCode: VatCode;
}

const RULES: SeedRule[] = [
    {
        direction: 'OUT',
        display: 'Apex Trader Funding',
        ledger: FUNDED,
        match: 'apex',
        vatCode: 'BU_EU_INK',
    },
    {
        direction: 'OUT',
        display: 'Tradeify',
        ledger: FUNDED,
        match: 'tradeify',
        vatCode: 'BU_EU_INK',
    },
    {
        direction: 'OUT',
        display: 'TakeProfitTrader',
        ledger: FUNDED,
        match: 'takeprofittrader',
        vatCode: 'BU_EU_INK',
    },
    {
        direction: 'OUT',
        display: 'Topstep',
        ledger: FUNDED,
        match: 'topstep',
        vatCode: 'BU_EU_INK',
    },
    {
        direction: 'OUT',
        display: 'FundingTicks',
        ledger: FUNDED,
        match: 'fundingticks',
        vatCode: 'BU_EU_INK',
    },
    {
        direction: 'OUT',
        display: 'My Funded Futures',
        ledger: FUNDED,
        match: 'My Funded Futures',
        vatCode: 'BU_EU_INK',
    },
    {
        direction: 'OUT',
        display: 'My Funded Futures',
        ledger: FUNDED,
        match: 'MyFundedFutures',
        vatCode: 'BU_EU_INK',
    },
    {
        direction: 'OUT',
        display: 'Alpha-Futures',
        ledger: FUNDED,
        match: 'Alpha-Futures',
        vatCode: 'BU_EU_INK',
    },
    {
        direction: 'OUT',
        display: 'FTMO',
        ledger: FUNDED,
        match: 'FTMO',
        vatCode: 'HOOG_INK_21',
    },
    {
        direction: 'OUT',
        display: 'Claude',
        ledger: SOFTWARE,
        match: 'claude',
        vatCode: 'BI_EU_INK',
    },
    {
        direction: 'OUT',
        display: 'Anthropic Ireland',
        ledger: SOFTWARE,
        match: 'anthropic',
        vatCode: 'BI_EU_INK',
    },
    {
        direction: 'OUT',
        display: 'STRATO',
        ledger: SOFTWARE,
        match: 'strato',
        vatCode: 'HOOG_INK_21',
    },
    {
        direction: 'OUT',
        display: 'TradeZella',
        ledger: SOFTWARE,
        match: 'tradezella',
        vatCode: 'BU_EU_INK',
    },
    {
        direction: 'OUT',
        display: 'TradingView',
        ledger: SOFTWARE,
        match: 'tradingview',
        vatCode: 'HOOG_INK_21',
    },
    {
        direction: 'OUT',
        display: 'Wifimedia',
        ledger: HARDWARE,
        match: 'wifimedia',
        vatCode: 'HOOG_INK_21',
    },
    {
        direction: 'OUT',
        display: 'Amazon EU',
        ledger: HARDWARE,
        match: 'amazon',
        vatCode: 'HOOG_INK_21',
    },
    {
        direction: 'OUT',
        display: 'MediaMarkt Online',
        ledger: HARDWARE,
        match: 'mediamarktonline',
        vatCode: 'HOOG_INK_21',
    },
    {
        direction: 'IN',
        display: 'Apex Trader Funding',
        ledger: PAYOUTS,
        match: 'apex',
        vatCode: 'BU_EU_VERK',
    },
    {
        direction: 'IN',
        display: 'Tradeify',
        ledger: PAYOUTS,
        match: 'tradeify',
        vatCode: 'BU_EU_VERK',
    },
    {
        direction: 'IN',
        display: 'TakeProfitTrader',
        ledger: PAYOUTS,
        match: 'takeprofittrader',
        vatCode: 'BU_EU_VERK',
    },
    {
        direction: 'IN',
        display: 'Topstep',
        ledger: PAYOUTS,
        match: 'topstep',
        vatCode: 'BU_EU_VERK',
    },
    {
        direction: 'IN',
        display: 'FundingTicks',
        ledger: PAYOUTS,
        match: 'fundingticks',
        vatCode: 'BU_EU_VERK',
    },
];

export default class SeedAccountingRules extends DatabaseSeeder {
    readonly name = 'accounting:rules';
    override readonly priority = 200;

    async run(): Promise<void> {
        const creds = await db
            .select({
                id: accountingCredential.id,
                userId: accountingCredential.userId,
            })
            .from(accountingCredential)
            .where(eq(accountingCredential.kind, 'eboekhouden'));
        if (creds.length === 0) return;

        for (const cred of creds) {
            const bankRows = BANK_ACCOUNTS.map((b) => ({
                credentialId: cred.id,
                currency: b.currency,
                ledgerId: b.ledger.id,
                ledgerLabel: b.ledger.label,
                userId: cred.userId,
            }));
            const bankInsert = db
                .insert(accountingBankAccount)
                .values(bankRows)
                .onConflictDoNothing();
            await bankInsert;

            const ruleRows = RULES.map((r) => ({
                credentialId: cred.id,
                direction: r.direction,
                display: r.display,
                ledgerId: r.ledger.id,
                ledgerLabel: r.ledger.label,
                match: r.match,
                userId: cred.userId,
                vatCode: r.vatCode,
            }));
            const ruleInsert = db
                .insert(accountingRule)
                .values(ruleRows)
                .onConflictDoNothing();
            await ruleInsert;
        }
    }
}
