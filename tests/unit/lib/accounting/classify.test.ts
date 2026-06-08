import { describe, expect, it } from 'vitest';

import type { BookingRule, RawTransaction } from '~/lib/accounting/core/types';

import { classifyTransaction } from '~/lib/accounting/core/orchestrator';

const HARDWARE = { id: 3, label: '0003 Trading Hardware' };
const FUNDED = { id: 1, label: '0001 Funded accounts' };
const PAYOUTS = { id: 4, label: '0004 Payouts' };

const RULES: BookingRule[] = [
    {
        direction: 'OUT',
        display: 'Amazon EU',
        id: 'r1',
        ledger: HARDWARE,
        match: 'amazon',
        vatCode: 'HOOG_INK_21',
    },
    {
        direction: 'OUT',
        display: 'Apex (cost)',
        id: 'r2',
        ledger: FUNDED,
        match: 'apex',
        vatCode: 'BU_EU_INK',
    },
    {
        direction: 'IN',
        display: 'Apex payout',
        id: 'r3',
        ledger: PAYOUTS,
        match: 'apex',
        vatCode: 'BU_EU_VERK',
    },
];

const tx = (overrides: Partial<RawTransaction>): RawTransaction => ({
    date: '2026-02-01',
    direction: 'OUT',
    merchant: 'Amazon',
    sourceAmount: 100,
    sourceCurrency: 'EUR',
    sourceFee: 0,
    sourceFeeCurrency: null,
    sourceId: 'test',
    txnId: 't-1',
    ...overrides,
});

describe('classifyTransaction', () => {
    it('matches an OUT merchant to its rule ledger', () => {
        const match = classifyTransaction(
            tx({ direction: 'OUT', merchant: 'Amazon Payments Europe' }),
            RULES,
        );
        expect(match).toEqual({
            display: 'Amazon EU',
            ledgerId: HARDWARE.id,
            ledgerLabel: HARDWARE.label,
        });
    });

    it('returns null for an unrecognised OUT merchant', () => {
        expect(
            classifyTransaction(
                tx({ direction: 'OUT', merchant: 'Random Cafe' }),
                RULES,
            ),
        ).toBeNull();
    });

    it('matches an IN payout source to its rule ledger', () => {
        const match = classifyTransaction(
            tx({ direction: 'IN', merchant: 'Apex Trader Funding payout' }),
            RULES,
        );
        expect(match).toEqual({
            display: 'Apex payout',
            ledgerId: PAYOUTS.id,
            ledgerLabel: PAYOUTS.label,
        });
    });

    it('routes the same name to different ledgers by direction', () => {
        const out = classifyTransaction(
            tx({ direction: 'OUT', merchant: 'apex' }),
            RULES,
        );
        const incoming = classifyTransaction(
            tx({ direction: 'IN', merchant: 'apex' }),
            RULES,
        );
        expect(out?.ledgerId).toBe(FUNDED.id);
        expect(incoming?.ledgerId).toBe(PAYOUTS.id);
    });

    it('returns null when there are no rules', () => {
        expect(classifyTransaction(tx({ merchant: 'Amazon' }), [])).toBeNull();
    });
});
