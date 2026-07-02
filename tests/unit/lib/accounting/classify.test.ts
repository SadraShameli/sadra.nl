import { describe, expect, it } from 'vitest';

import type { RawTransaction } from '~/lib/accounting/core/types';

import { currencyCodeSchema } from '~/lib/accounting/core/currency';
import { isoDateSchema } from '~/lib/accounting/core/date';
import { Rule } from '~/lib/accounting/core/rules/rule';
import { RuleSet } from '~/lib/accounting/core/rules/rule-set';

const HARDWARE = { id: 3, label: '0003 Trading Hardware' };
const FUNDED = { id: 1, label: '0001 Funded accounts' };
const PAYOUTS = { id: 4, label: '0004 Payouts' };

const ruleSet = new RuleSet([
    Rule.fromRow({
        direction: 'OUT',
        display: 'Amazon EU',
        id: 'r1',
        ledger: HARDWARE,
        match: 'amazon',
        taxCode: 'HOOG_INK_21',
    }),
    Rule.fromRow({
        direction: 'OUT',
        display: 'Apex (cost)',
        id: 'r2',
        ledger: FUNDED,
        match: 'apex',
        taxCode: 'BU_EU_INK',
    }),
    Rule.fromRow({
        direction: 'IN',
        display: 'Apex payout',
        id: 'r3',
        ledger: PAYOUTS,
        match: 'apex',
        taxCode: 'BU_EU_VERK',
    }),
]);

const tx = (overrides: Partial<RawTransaction>): RawTransaction => ({
    date: isoDateSchema.parse('2026-02-01'),
    direction: 'OUT',
    merchant: 'Amazon',
    sourceAmount: 100,
    sourceCurrency: currencyCodeSchema.parse('EUR'),
    sourceFee: 0,
    sourceFeeCurrency: null,
    sourceId: 'test',
    txnId: 't-1',
    ...overrides,
});

describe('RuleSet.classify', () => {
    it('matches an OUT merchant to its rule ledger', () => {
        const match = ruleSet.classify(
            tx({ direction: 'OUT', merchant: 'Amazon Payments Europe' }),
        );
        expect(match).toEqual({
            display: 'Amazon EU',
            ledgerId: HARDWARE.id,
            ledgerLabel: HARDWARE.label,
        });
    });

    it('returns null for an unrecognised OUT merchant', () => {
        expect(
            ruleSet.classify(tx({ direction: 'OUT', merchant: 'Random Cafe' })),
        ).toBeNull();
    });

    it('matches an IN payout source to its rule ledger', () => {
        const match = ruleSet.classify(
            tx({ direction: 'IN', merchant: 'Apex Trader Funding payout' }),
        );
        expect(match).toEqual({
            display: 'Apex payout',
            ledgerId: PAYOUTS.id,
            ledgerLabel: PAYOUTS.label,
        });
    });

    it('routes the same name to different ledgers by direction', () => {
        const out = ruleSet.classify(
            tx({ direction: 'OUT', merchant: 'apex' }),
        );
        const incoming = ruleSet.classify(
            tx({ direction: 'IN', merchant: 'apex' }),
        );
        expect(out?.ledgerId).toBe(FUNDED.id);
        expect(incoming?.ledgerId).toBe(PAYOUTS.id);
    });

    it('returns null when there are no rules', () => {
        expect(new RuleSet([]).classify(tx({ merchant: 'Amazon' }))).toBeNull();
    });

    it('classifies a card refund to the purchase ledger, not the payout ledger', () => {
        const match = ruleSet.classify(
            tx({ direction: 'IN', isRefund: true, merchant: 'ApexFutures' }),
        );
        expect(match).toEqual({
            display: 'Apex (cost)',
            ledgerId: FUNDED.id,
            ledgerLabel: FUNDED.label,
        });
    });
});
