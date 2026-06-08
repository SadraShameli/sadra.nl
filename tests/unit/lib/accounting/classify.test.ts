import { describe, expect, it } from 'vitest';

import type { RawTransaction } from '~/lib/accounting/core/types';

import { LEDGERS } from '~/lib/accounting/config/ledgers';
import { classifyTransaction } from '~/lib/accounting/core/orchestrator';

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
    it('matches an OUT merchant to its expense ledger', () => {
        const match = classifyTransaction(
            tx({ direction: 'OUT', merchant: 'Amazon Payments Europe' }),
        );
        expect(match).toEqual({
            display: 'Amazon EU',
            ledgerId: LEDGERS.HARDWARE.id,
            ledgerLabel: LEDGERS.HARDWARE.label,
        });
    });

    it('returns null for an unrecognised OUT merchant', () => {
        expect(
            classifyTransaction(
                tx({ direction: 'OUT', merchant: 'Random Cafe' }),
            ),
        ).toBeNull();
    });

    it('matches an IN payout source to the payouts ledger', () => {
        const match = classifyTransaction(
            tx({ direction: 'IN', merchant: 'Apex Trader Funding payout' }),
        );
        expect(match).toEqual({
            display: 'Apex Trader Funding',
            ledgerId: LEDGERS.PAYOUTS.id,
            ledgerLabel: LEDGERS.PAYOUTS.label,
        });
    });

    it('routes the same name to different ledgers by direction', () => {
        const out = classifyTransaction(
            tx({ direction: 'OUT', merchant: 'apex' }),
        );
        const incoming = classifyTransaction(
            tx({ direction: 'IN', merchant: 'apex' }),
        );
        expect(out?.ledgerId).toBe(LEDGERS.FUNDED.id);
        expect(incoming?.ledgerId).toBe(LEDGERS.PAYOUTS.id);
    });

    it('returns null for an unrecognised IN source', () => {
        expect(
            classifyTransaction(
                tx({ direction: 'IN', merchant: 'Unknown LLC' }),
            ),
        ).toBeNull();
    });
});
