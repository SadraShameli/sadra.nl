import { describe, expect, it } from 'vitest';

import type { RawTransaction } from '~/lib/accounting/core/types';

import { currencyCodeSchema } from '~/lib/accounting/core/currency';
import { isoDateSchema } from '~/lib/accounting/core/date';
import { LedgerId } from '~/lib/accounting/core/ids';
import { Rule } from '~/lib/accounting/core/rules/rule';
import { RuleSet } from '~/lib/accounting/core/rules/rule-set';

const ledger = { id: LedgerId('1'), label: '0001 Ledger' };

const ruleSet = new RuleSet([
    Rule.fromRow({
        direction: 'OUT',
        display: 'Anthropic Ireland',
        id: 'r1',
        ledger,
        match: 'anthropic',
        taxCode: 'BI_EU_INK',
    }),
    Rule.fromRow({
        direction: 'OUT',
        display: 'TakeProfitTrader',
        id: 'r2',
        ledger,
        match: 'takeprofittrader',
        taxCode: 'BU_EU_INK',
    }),
    Rule.fromRow({
        direction: 'IN',
        display: 'Apex Trader Funding',
        id: 'r3',
        ledger,
        match: 'apex',
        taxCode: 'BU_EU_VERK',
    }),
]);

const tx = (overrides: {
    direction: 'IN' | 'OUT';
    isRefund?: boolean;
    merchant: string;
}): RawTransaction => ({
    date: isoDateSchema.parse('2026-02-01'),
    direction: overrides.direction,
    isRefund: overrides.isRefund,
    merchant: overrides.merchant,
    sourceAmount: 100,
    sourceCurrency: currencyCodeSchema.parse('EUR'),
    sourceFee: 0,
    sourceFeeCurrency: null,
    sourceId: 'test',
    txnId: 't-1',
});

describe('rule matcher', () => {
    it('matches case- and space-insensitively against substrings', () => {
        const rule = ruleSet.findMatch(
            tx({ direction: 'OUT', merchant: 'Anthropic Ireland LTD' }),
        );
        expect(rule?.display).toBe('Anthropic Ireland');
    });

    it('matches even with embedded whitespace removed', () => {
        const rule = ruleSet.findMatch(
            tx({ direction: 'OUT', merchant: 'TAKE  PROFIT  TRADER' }),
        );
        expect(rule?.display).toBe('TakeProfitTrader');
    });

    it('returns null for unknown merchants', () => {
        expect(
            ruleSet.findMatch(
                tx({ direction: 'OUT', merchant: 'Some unknown vendor' }),
            ),
        ).toBeNull();
        expect(
            ruleSet.findMatch(tx({ direction: 'OUT', merchant: '' })),
        ).toBeNull();
    });

    it('only matches a rule with the same direction', () => {
        expect(
            ruleSet.findMatch(tx({ direction: 'OUT', merchant: 'apex' })),
        ).toBeNull();
        const rule = ruleSet.findMatch(
            tx({ direction: 'IN', merchant: 'apex trader funding' }),
        );
        expect(rule?.taxCode.toString()).toBe('BU_EU_VERK');
    });

    it('routes a refund to the matching OUT purchase rule, not an IN rule', () => {
        const rule = ruleSet.findMatch(
            tx({
                direction: 'IN',
                isRefund: true,
                merchant: 'TakeProfitTrader',
            }),
        );
        expect(rule?.display).toBe('TakeProfitTrader');
        expect(rule?.taxCode.toString()).toBe('BU_EU_INK');
    });

    it('returns null for a refund with no matching purchase rule', () => {
        expect(
            ruleSet.findMatch(
                tx({ direction: 'IN', isRefund: true, merchant: 'apex' }),
            ),
        ).toBeNull();
    });
});
