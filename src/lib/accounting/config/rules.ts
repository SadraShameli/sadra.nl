import type { MerchantRule, PayoutRule } from '../core/rules';

import { LEDGERS } from './ledgers';
export const MERCHANTS: readonly MerchantRule[] = [
    {
        display: 'Apex Trader Funding',
        ledger: LEDGERS.FUNDED,
        match: 'apex',
        vatCode: 'BU_EU_INK',
    },
    {
        display: 'Tradeify',
        ledger: LEDGERS.FUNDED,
        match: 'tradeify',
        vatCode: 'BU_EU_INK',
    },
    {
        display: 'TakeProfitTrader',
        ledger: LEDGERS.FUNDED,
        match: 'takeprofittrader',
        vatCode: 'BU_EU_INK',
    },
    {
        display: 'Topstep',
        ledger: LEDGERS.FUNDED,
        match: 'topstep',
        vatCode: 'BU_EU_INK',
    },
    {
        display: 'FundingTicks',
        ledger: LEDGERS.FUNDED,
        match: 'fundingticks',
        vatCode: 'BU_EU_INK',
    },
    {
        display: 'Claude',
        ledger: LEDGERS.SOFTWARE,
        match: 'claude',
        vatCode: 'BI_EU_INK',
    },
    {
        display: 'Anthropic Ireland',
        ledger: LEDGERS.SOFTWARE,
        match: 'anthropic',
        vatCode: 'BI_EU_INK',
    },
    {
        display: 'Wifimedia',
        ledger: LEDGERS.HARDWARE,
        match: 'wifimedia',
        vatCode: 'HOOG_INK_21',
    },
    {
        display: 'Amazon EU',
        ledger: LEDGERS.HARDWARE,
        match: 'amazon',
        vatCode: 'HOOG_INK_21',
    },
    {
        display: 'MediaMarkt Online',
        ledger: LEDGERS.HARDWARE,
        match: 'mediamarktonline',
        vatCode: 'HOOG_INK_21',
    },
    {
        display: 'TradeZella',
        ledger: LEDGERS.SOFTWARE,
        match: 'tradezella',
        vatCode: 'BU_EU_INK',
    },
] as const;

export const PAYOUT_SOURCES: readonly PayoutRule[] = [
    {
        display: 'Apex Trader Funding',
        ledger: LEDGERS.PAYOUTS,
        match: 'apex',
        vatCode: 'BU_EU_VERK',
    },
    {
        display: 'Tradeify',
        ledger: LEDGERS.PAYOUTS,
        match: 'tradeify',
        vatCode: 'BU_EU_VERK',
    },
    {
        display: 'TakeProfitTrader',
        ledger: LEDGERS.PAYOUTS,
        match: 'takeprofittrader',
        vatCode: 'BU_EU_VERK',
    },
    {
        display: 'Topstep',
        ledger: LEDGERS.PAYOUTS,
        match: 'topstep',
        vatCode: 'BU_EU_VERK',
    },
    {
        display: 'FundingTicks',
        ledger: LEDGERS.PAYOUTS,
        match: 'fundingticks',
        vatCode: 'BU_EU_VERK',
    },
] as const;
