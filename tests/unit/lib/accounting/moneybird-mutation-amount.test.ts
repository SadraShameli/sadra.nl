import { afterEach, describe, expect, it, vi } from 'vitest';

import { MoneybirdClient } from '~/lib/accounting/providers/moneybird/client';
import { MoneybirdSession } from '~/lib/accounting/providers/moneybird/provider';

import { FakeMoneybirdApi } from './moneybird-fake-api';

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('MoneybirdSession.listMutations amounts', () => {
    it('reports the invoice total in euros and leaves other currencies blank', async () => {
        FakeMoneybirdApi.serve({
            externalSalesInvoices: [
                {
                    currency: 'USD',
                    date: '2026-09-01',
                    id: 'inv-usd',
                    totalPriceInclTax: '121.0',
                },
            ],
            purchaseInvoices: [
                {
                    currency: 'EUR',
                    date: '2026-09-02',
                    id: 'inv-eur',
                    totalPriceInclTax: '363.0',
                },
            ],
        });

        const session = new MoneybirdSession(
            new MoneybirdClient('tok', 'admin-1'),
        );
        const mutations = await session.listMutations({ limit: 10 });

        expect(
            mutations.map((mutation) => [mutation.externalId, mutation.amount]),
        ).toEqual([
            ['inv-eur', 363],
            ['inv-usd', null],
        ]);
    });
});

describe('MoneybirdSession.countMutations', () => {
    it('says it cannot know the total instead of guessing one', async () => {
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);

        const session = new MoneybirdSession(
            new MoneybirdClient('tok', 'admin-1'),
        );

        await expect(session.countMutations()).resolves.toBeNull();
        expect(fetch).not.toHaveBeenCalled();
    });
});
