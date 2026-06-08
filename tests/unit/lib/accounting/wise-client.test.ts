import { describe, expect, it, vi } from 'vitest';

import { WiseClient } from '~/lib/accounting/wise/client';

const FROM = '2026-01-01';
const TO = '2026-01-31';
const PROFILE_ID = 123;

function activity(overrides: {
    primaryAmount?: string;
    secondaryAmount?: string;
    status?: string;
    title?: string;
    type: string;
}) {
    return {
        createdOn: '2026-01-15T10:00:00Z',
        primaryAmount: overrides.primaryAmount ?? '-25.00 EUR',
        resource: { id: 'act-1' },
        secondaryAmount: overrides.secondaryAmount ?? '-25.00 EUR',
        status: overrides.status ?? 'COMPLETED',
        title: overrides.title ?? 'Merchant',
        type: overrides.type,
    };
}

function mockFetch(activities: object[]): typeof fetch {
    return vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ activities, cursor: null }),
        ok: true,
    });
}

describe('WiseClient.listCardTransactions', () => {
    it('includes CARD_PAYMENT activities', async () => {
        const client = new WiseClient('tok', {
            fetch: mockFetch([
                activity({ title: 'Netflix', type: 'CARD_PAYMENT' }),
            ]),
        });
        const txns = await client.listCardTransactions({
            from: FROM,
            profileId: PROFILE_ID,
            to: TO,
        });
        expect(txns).toHaveLength(1);
        expect(txns[0]).toMatchObject({ isRefund: false, merchant: 'Netflix' });
    });

    it('includes DIRECT_DEBIT_TRANSACTION activities', async () => {
        const client = new WiseClient('tok', {
            fetch: mockFetch([
                activity({
                    title: 'STRATO GmbH',
                    type: 'DIRECT_DEBIT_TRANSACTION',
                }),
            ]),
        });
        const txns = await client.listCardTransactions({
            from: FROM,
            profileId: PROFILE_ID,
            to: TO,
        });
        expect(txns).toHaveLength(1);
        expect(txns[0]).toMatchObject({
            isRefund: false,
            merchant: 'STRATO GmbH',
        });
    });

    it('excludes other activity types', async () => {
        const client = new WiseClient('tok', {
            fetch: mockFetch([activity({ type: 'BALANCE_TRANSFER' })]),
        });
        const txns = await client.listCardTransactions({
            from: FROM,
            profileId: PROFILE_ID,
            to: TO,
        });
        expect(txns).toHaveLength(0);
    });

    it('excludes non-COMPLETED activities', async () => {
        const client = new WiseClient('tok', {
            fetch: mockFetch([
                activity({
                    status: 'PENDING',
                    type: 'DIRECT_DEBIT_TRANSACTION',
                }),
            ]),
        });
        const txns = await client.listCardTransactions({
            from: FROM,
            profileId: PROFILE_ID,
            to: TO,
        });
        expect(txns).toHaveLength(0);
    });

    it('treats negative primaryAmount as non-refund', async () => {
        const client = new WiseClient('tok', {
            fetch: mockFetch([
                activity({
                    primaryAmount: '-99.00 USD',
                    type: 'DIRECT_DEBIT_TRANSACTION',
                }),
            ]),
        });
        const txns = await client.listCardTransactions({
            from: FROM,
            profileId: PROFILE_ID,
            to: TO,
        });
        expect(txns[0]?.isRefund).toBe(false);
    });
});
