import { eq, sql } from 'drizzle-orm';

import type { BookingDirection } from '~/lib/accounting/core/types';

import { LedgerId } from '~/lib/accounting/core/ids';
import { CredentialKind } from '~/lib/accounting/credentials/registry';
import { VatCode } from '~/lib/accounting/providers/eboekhouden/enums';
import {
    accountingBankAccount,
    accountingCredential,
    accountingRule,
    db,
} from '~/server/db';
import { DatabaseSeeder } from '~/server/db/types';

import { seedBankAccountsFor } from './bankAccounts';

interface LedgerReference {
    id: LedgerId;
    label: string;
}

const FUNDED: LedgerReference = {
    id: LedgerId('46580770'),
    label: '0001 Funded accounts',
};
const SOFTWARE: LedgerReference = {
    id: LedgerId('46581706'),
    label: '0002 Trading Software',
};
const HARDWARE: LedgerReference = {
    id: LedgerId('46724292'),
    label: '0003 Trading Hardware',
};
const PAYOUTS: LedgerReference = {
    id: LedgerId('48217305'),
    label: '0004 Payouts',
};
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
        vatCode: VatCode.BuEuInk,
    },
    {
        direction: 'OUT',
        display: 'Tradeify',
        ledger: FUNDED,
        match: 'tradeify',
        vatCode: VatCode.BuEuInk,
    },
    {
        direction: 'OUT',
        display: 'TakeProfitTrader',
        ledger: FUNDED,
        match: 'takeprofittrader',
        vatCode: VatCode.BuEuInk,
    },
    {
        direction: 'OUT',
        display: 'Topstep',
        ledger: FUNDED,
        match: 'topstep',
        vatCode: VatCode.HoogInk21,
    },
    {
        direction: 'OUT',
        display: 'FundingTicks',
        ledger: FUNDED,
        match: 'fundingticks',
        vatCode: VatCode.BuEuInk,
    },
    {
        direction: 'OUT',
        display: 'My Funded Futures',
        ledger: FUNDED,
        match: 'My Funded Futures',
        vatCode: VatCode.BuEuInk,
    },
    {
        direction: 'OUT',
        display: 'My Funded Futures',
        ledger: FUNDED,
        match: 'MyFundedFutures',
        vatCode: VatCode.BuEuInk,
    },
    {
        direction: 'OUT',
        display: 'Alpha-Futures',
        ledger: FUNDED,
        match: 'Alpha-Futures',
        vatCode: VatCode.BuEuInk,
    },
    {
        direction: 'OUT',
        display: 'FTMO',
        ledger: FUNDED,
        match: 'FTMO',
        vatCode: VatCode.HoogInk21,
    },
    {
        direction: 'OUT',
        display: 'Claude',
        ledger: SOFTWARE,
        match: 'claude',
        vatCode: VatCode.BiEuInk,
    },
    {
        direction: 'OUT',
        display: 'Anthropic Ireland',
        ledger: SOFTWARE,
        match: 'anthropic',
        vatCode: VatCode.BiEuInk,
    },
    {
        direction: 'OUT',
        display: 'STRATO',
        ledger: SOFTWARE,
        match: 'strato',
        vatCode: VatCode.HoogInk21,
    },
    {
        direction: 'OUT',
        display: 'TradeZella',
        ledger: SOFTWARE,
        match: 'tradezella',
        vatCode: VatCode.BuEuInk,
    },
    {
        direction: 'OUT',
        display: 'SkillSource (e-Boekhouden)',
        ledger: SOFTWARE,
        match: 'skillsource',
        vatCode: VatCode.HoogInk21,
    },
    {
        direction: 'OUT',
        display: 'TradingView',
        ledger: SOFTWARE,
        match: 'tradingview',
        vatCode: VatCode.HoogInk21,
    },
    {
        direction: 'OUT',
        display: 'Wifimedia',
        ledger: HARDWARE,
        match: 'wifimedia',
        vatCode: VatCode.HoogInk21,
    },
    {
        direction: 'OUT',
        display: 'Amazon EU',
        ledger: HARDWARE,
        match: 'amazon',
        vatCode: VatCode.HoogInk21,
    },
    {
        direction: 'OUT',
        display: 'MediaMarkt Online',
        ledger: HARDWARE,
        match: 'mediamarktonline',
        vatCode: VatCode.HoogInk21,
    },
    {
        direction: 'OUT',
        display: 'AliExpress',
        ledger: HARDWARE,
        match: 'AliExpress',
        vatCode: VatCode.HoogInk21,
    },
    {
        direction: 'OUT',
        display: 'Coolblue',
        ledger: HARDWARE,
        match: 'coolblue',
        vatCode: VatCode.HoogInk21,
    },
    {
        direction: 'IN',
        display: 'Apex Trader Funding',
        ledger: PAYOUTS,
        match: 'apex',
        vatCode: VatCode.BuEuVerk,
    },
    {
        direction: 'IN',
        display: 'Tradeify',
        ledger: PAYOUTS,
        match: 'tradeify',
        vatCode: VatCode.BuEuVerk,
    },
    {
        direction: 'IN',
        display: 'My Funded Futures',
        ledger: PAYOUTS,
        match: 'myfunded',
        vatCode: VatCode.BuEuVerk,
    },
    {
        direction: 'IN',
        display: 'Rise Works',
        ledger: PAYOUTS,
        match: 'riseworks',
        vatCode: VatCode.BuEuVerk,
    },
    {
        direction: 'IN',
        display: 'TakeProfitTrader',
        ledger: PAYOUTS,
        match: 'takeprofittrader',
        vatCode: VatCode.BuEuVerk,
    },
    {
        direction: 'IN',
        display: 'Topstep',
        ledger: PAYOUTS,
        match: 'topstep',
        vatCode: VatCode.BuEuVerk,
    },
    {
        direction: 'IN',
        display: 'FundingTicks',
        ledger: PAYOUTS,
        match: 'fundingticks',
        vatCode: VatCode.BuEuVerk,
    },
];

export default class SeedAccountingRules extends DatabaseSeeder {
    readonly name = 'accounting:rules';
    override readonly priority = 200;

    async run(): Promise<void> {
        const creds = await db
            .select({
                id: accountingCredential.id,
                label: accountingCredential.label,
                userId: accountingCredential.userId,
            })
            .from(accountingCredential)
            .where(eq(accountingCredential.kind, CredentialKind.EBoekhouden));
        if (creds.length === 0) return;

        for (const cred of creds) {
            const { accounts, isOverride } = seedBankAccountsFor(cred.label);
            const bankRows = accounts.map((b) => ({
                credentialId: cred.id,
                currency: b.currency,
                ledgerId: b.ledger.id,
                ledgerLabel: b.ledger.label,
                userId: cred.userId,
            }));
            const bankInsert = db
                .insert(accountingBankAccount)
                .values(bankRows);
            await (isOverride
                ? bankInsert.onConflictDoUpdate({
                      set: {
                          ledgerId: sql`excluded.ledger_id`,
                          ledgerLabel: sql`excluded.ledger_label`,
                          updatedAt: new Date(),
                      },
                      target: [
                          accountingBankAccount.userId,
                          accountingBankAccount.credentialId,
                          accountingBankAccount.currency,
                      ],
                  })
                : bankInsert.onConflictDoNothing());

            for (const r of RULES) {
                const ruleUpsert = db
                    .insert(accountingRule)
                    .values({
                        credentialId: cred.id,
                        direction: r.direction,
                        display: r.display,
                        ledgerId: r.ledger.id,
                        ledgerLabel: r.ledger.label,
                        match: r.match,
                        userId: cred.userId,
                        vatCode: r.vatCode,
                    })
                    .onConflictDoUpdate({
                        set: {
                            display: r.display,
                            ledgerId: r.ledger.id,
                            ledgerLabel: r.ledger.label,
                            updatedAt: new Date(),
                            vatCode: r.vatCode,
                        },
                        target: [
                            accountingRule.userId,
                            accountingRule.credentialId,
                            accountingRule.direction,
                            accountingRule.match,
                        ],
                    });
                await ruleUpsert;
            }
        }
    }
}
