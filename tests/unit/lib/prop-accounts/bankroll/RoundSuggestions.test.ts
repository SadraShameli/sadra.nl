import { describe, expect, it } from 'vitest';

import { roundSuggestions } from '~/lib/prop-accounts/bankroll';
import { FirmKeyKind } from '~/lib/prop-accounts/core';
import { FirmId } from '~/lib/prop-calculator';

const FIRM_A = { firmId: FirmId.Lucid, kind: FirmKeyKind.Modeled as const };
const FIRM_B = { firmId: FirmId.TopStep, kind: FirmKeyKind.Modeled as const };

describe('roundSuggestions', () => {
    it('groups purchases within the gap into one suggestion', () => {
        const suggestions = roundSuggestions(
            [
                { accountId: 'a1', firmKey: FIRM_A, purchasedOn: '2026-09-01' },
                { accountId: 'a2', firmKey: FIRM_A, purchasedOn: '2026-09-05' },
                { accountId: 'a3', firmKey: FIRM_A, purchasedOn: '2026-09-10' },
            ],
            14,
        );
        expect(suggestions).toHaveLength(1);
        expect(suggestions[0]).toMatchObject({
            earliestPurchase: '2026-09-01',
            firmKey: FIRM_A,
            latestPurchase: '2026-09-10',
            memberAccountIds: ['a1', 'a2', 'a3'],
        });
    });

    it('splits into separate suggestions across a gap wider than the setting', () => {
        const suggestions = roundSuggestions(
            [
                { accountId: 'a1', firmKey: FIRM_A, purchasedOn: '2026-09-01' },
                { accountId: 'a2', firmKey: FIRM_A, purchasedOn: '2026-09-05' },
                { accountId: 'a3', firmKey: FIRM_A, purchasedOn: '2026-10-01' },
                { accountId: 'a4', firmKey: FIRM_A, purchasedOn: '2026-10-03' },
            ],
            14,
        );
        expect(suggestions).toHaveLength(2);
        expect(suggestions[0]?.memberAccountIds).toEqual(['a1', 'a2']);
        expect(suggestions[1]?.memberAccountIds).toEqual(['a3', 'a4']);
    });

    it('never groups across firms', () => {
        const suggestions = roundSuggestions(
            [
                { accountId: 'a1', firmKey: FIRM_A, purchasedOn: '2026-09-01' },
                { accountId: 'b1', firmKey: FIRM_B, purchasedOn: '2026-09-02' },
            ],
            14,
        );
        expect(suggestions).toHaveLength(0);
    });

    it('does not suggest a lone purchase', () => {
        const suggestions = roundSuggestions(
            [{ accountId: 'a1', firmKey: FIRM_A, purchasedOn: '2026-09-01' }],
            14,
        );
        expect(suggestions).toEqual([]);
    });

    it('is exactly at the gap boundary inclusive', () => {
        const suggestions = roundSuggestions(
            [
                { accountId: 'a1', firmKey: FIRM_A, purchasedOn: '2026-09-01' },
                { accountId: 'a2', firmKey: FIRM_A, purchasedOn: '2026-09-15' },
            ],
            14,
        );
        expect(suggestions).toHaveLength(1);
    });

    it('splits just past the gap boundary', () => {
        const suggestions = roundSuggestions(
            [
                { accountId: 'a1', firmKey: FIRM_A, purchasedOn: '2026-09-01' },
                { accountId: 'a2', firmKey: FIRM_A, purchasedOn: '2026-09-16' },
            ],
            14,
        );
        expect(suggestions).toHaveLength(0);
    });
});
