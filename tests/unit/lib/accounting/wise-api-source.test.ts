import { describe, expect, it, vi } from 'vitest';

import { wiseApiSource } from '~/lib/accounting/sources/wise-api';

const PROFILE_ID = 72_717_419;

function activity(options: {
    primaryAmount: string;
    secondaryAmount?: string;
    title: string;
    type?: string;
}) {
    return {
        createdOn: '2026-01-15T10:00:00Z',
        primaryAmount: options.primaryAmount,
        resource: { id: '999' },
        secondaryAmount: options.secondaryAmount ?? '',
        status: 'COMPLETED',
        title: options.title,
        type: options.type ?? 'CARD_PAYMENT',
    };
}

function makeContext(fetchMock: typeof fetch) {
    return {
        fetchImpl: fetchMock,
        from: '2026-01-01',
        meta: { profileId: PROFILE_ID, sandbox: false },
        secret: 'tok',
        to: '2026-01-31',
    };
}

function wiseFetch(activities: object[]): typeof fetch {
    return vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url =
            input instanceof URL
                ? input.href
                : input instanceof Request
                  ? input.url
                  : input;
        if (url.includes('/v1/transfers')) {
            return Promise.resolve({
                json: () => Promise.resolve([]),
                ok: true,
            });
        }
        return Promise.resolve({
            json: () => Promise.resolve({ activities, cursor: null }),
            ok: true,
        });
    });
}

describe('wiseApiSource – sourceCurrency selection', () => {
    it('EUR primary, USD secondary (e.g. STRATO from USD balance): uses EUR primary directly', async () => {
        const context = makeContext(
            wiseFetch([
                activity({
                    primaryAmount: '28 EUR',
                    secondaryAmount: '32.33 USD',
                    title: 'STRATO GmbH',
                    type: 'DIRECT_DEBIT_TRANSACTION',
                }),
            ]),
        );
        const txns = await wiseApiSource.fetch(context);
        expect(txns).toHaveLength(1);
        expect(txns[0]).toMatchObject({
            sourceAmount: 28,
            sourceCurrency: 'EUR',
        });
    });

    it('EUR primary, null secondary (e.g. Amazon from EUR balance): uses EUR primary', async () => {
        const context = makeContext(
            wiseFetch([
                activity({
                    primaryAmount: '32.34 EUR',
                    title: 'Amazon',
                }),
            ]),
        );
        const txns = await wiseApiSource.fetch(context);
        expect(txns[0]).toMatchObject({
            sourceAmount: 32.34,
            sourceCurrency: 'EUR',
        });
    });

    it('USD primary, null secondary (e.g. Apex from USD balance): uses USD primary for ECB conversion', async () => {
        const context = makeContext(
            wiseFetch([
                activity({
                    primaryAmount: '345 USD',
                    title: 'ApexFutures',
                }),
            ]),
        );
        const txns = await wiseApiSource.fetch(context);
        expect(txns[0]).toMatchObject({
            sourceAmount: 345,
            sourceCurrency: 'USD',
        });
    });

    it('USD primary, EUR secondary (e.g. Apex from EUR balance): uses exact EUR secondary, no ECB needed', async () => {
        const context = makeContext(
            wiseFetch([
                activity({
                    primaryAmount: '29.90 USD',
                    secondaryAmount: '25.85 EUR',
                    title: 'ApexFutures',
                }),
            ]),
        );
        const txns = await wiseApiSource.fetch(context);
        expect(txns[0]).toMatchObject({
            sourceAmount: 25.85,
            sourceCurrency: 'EUR',
        });
    });

    it('EUR primary, "USD, EUR" secondary (TradingView/MediaMarkt: unparseable secondary): uses EUR primary', async () => {
        const context = makeContext(
            wiseFetch([
                activity({
                    primaryAmount: '101.64 EUR',
                    secondaryAmount: 'USD, EUR',
                    title: 'TradingView',
                }),
            ]),
        );
        const txns = await wiseApiSource.fetch(context);
        expect(txns[0]).toMatchObject({
            sourceAmount: 101.64,
            sourceCurrency: 'EUR',
        });
    });
});
