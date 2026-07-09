import { afterEach, describe, expect, it, vi } from 'vitest';

import { listMoneybirdAdministrations } from '~/lib/accounting/providers/moneybird/client';

function stubFetch(body: unknown, status = 200) {
    const fetchMock = vi.fn().mockResolvedValue({
        status,
        text: () => Promise.resolve(JSON.stringify(body)),
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('listMoneybirdAdministrations', () => {
    it('calls the unscoped administrations endpoint, not one scoped to an administration', async () => {
        const fetchMock = stubFetch([
            { currency: 'EUR', id: '123', name: 'Sadra B.V.' },
        ]);
        await listMoneybirdAdministrations('tok');
        expect(fetchMock).toHaveBeenCalledWith(
            'https://moneybird.com/api/v2/administrations.json',
            expect.objectContaining({
                headers: { Authorization: 'Bearer tok' },
            }),
        );
    });

    it('parses the administration list', async () => {
        stubFetch([{ currency: 'EUR', id: '123', name: 'Sadra B.V.' }]);
        const administrations = await listMoneybirdAdministrations('tok');
        expect(administrations).toEqual([
            { currency: 'EUR', id: '123', name: 'Sadra B.V.' },
        ]);
    });

    it('raises a MoneybirdApiError on a non-2xx response', async () => {
        stubFetch({ error: 'invalid token' }, 401);
        await expect(listMoneybirdAdministrations('bad-tok')).rejects.toThrow(
            'invalid token',
        );
    });
});
