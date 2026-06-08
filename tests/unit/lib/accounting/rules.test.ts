import { describe, expect, it } from 'vitest';

import type { BookingRule } from '~/lib/accounting/core/types';

import { findRule } from '~/lib/accounting/core/rules';

const ledger = { id: 1, label: '0001 Ledger' };

const RULES: BookingRule[] = [
    {
        direction: 'OUT',
        display: 'Anthropic Ireland',
        id: 'r1',
        ledger,
        match: 'anthropic',
        vatCode: 'BI_EU_INK',
    },
    {
        direction: 'OUT',
        display: 'TakeProfitTrader',
        id: 'r2',
        ledger,
        match: 'takeprofittrader',
        vatCode: 'BU_EU_INK',
    },
    {
        direction: 'IN',
        display: 'Apex Trader Funding',
        id: 'r3',
        ledger,
        match: 'apex',
        vatCode: 'BU_EU_VERK',
    },
];

describe('rule matcher', () => {
    it('matches case- and space-insensitively against substrings', () => {
        const rule = findRule(RULES, {
            direction: 'OUT',
            merchant: 'Anthropic Ireland LTD',
        });
        expect(rule?.display).toBe('Anthropic Ireland');
    });

    it('matches even with embedded whitespace removed', () => {
        const rule = findRule(RULES, {
            direction: 'OUT',
            merchant: 'TAKE  PROFIT  TRADER',
        });
        expect(rule?.display).toBe('TakeProfitTrader');
    });

    it('returns null for unknown merchants', () => {
        expect(
            findRule(RULES, {
                direction: 'OUT',
                merchant: 'Some unknown vendor',
            }),
        ).toBeNull();
        expect(findRule(RULES, { direction: 'OUT', merchant: '' })).toBeNull();
        expect(
            findRule(RULES, { direction: 'OUT', merchant: null }),
        ).toBeNull();
    });

    it('only matches a rule with the same direction', () => {
        expect(
            findRule(RULES, { direction: 'OUT', merchant: 'apex' }),
        ).toBeNull();
        const rule = findRule(RULES, {
            direction: 'IN',
            merchant: 'apex trader funding',
        });
        expect(rule?.vatCode).toBe('BU_EU_VERK');
    });

    it('routes a refund to the matching OUT purchase rule, not an IN rule', () => {
        const rule = findRule(RULES, {
            direction: 'IN',
            isRefund: true,
            merchant: 'TakeProfitTrader',
        });
        expect(rule?.display).toBe('TakeProfitTrader');
        expect(rule?.vatCode).toBe('BU_EU_INK');
    });

    it('returns null for a refund with no matching purchase rule', () => {
        expect(
            findRule(RULES, {
                direction: 'IN',
                isRefund: true,
                merchant: 'apex',
            }),
        ).toBeNull();
    });
});
