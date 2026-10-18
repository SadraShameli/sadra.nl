import { afterEach, describe, expect, it, vi } from 'vitest';

import { eboekhoudenProvider } from '~/lib/accounting/providers/eboekhouden/provider';

const PAGE_SIZE = 2000;

function mutation(id: number, date: string) {
    return { date, id, ledgerId: 1, rows: [], type: 'Payment' };
}

const JANUARY = Array.from({ length: PAGE_SIZE }, (_, index) =>
    mutation(index + 1, '2026-01-15'),
);
const OCTOBER = [mutation(PAGE_SIZE + 1, '2026-10-05')];

function respond(input: Request | string | URL): Response {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.pathname.endsWith('/session')) {
        return Response.json({ expiresIn: 3600, token: 'session-token' });
    }
    const offset = Number(url.searchParams.get('offset') ?? '0');
    return Response.json({ items: offset === 0 ? JANUARY : OCTOBER });
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('eBoekhouden listMutations with a date filter', () => {
    it('finds a matching mutation past the first raw page', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((input) =>
            Promise.resolve(respond(input)),
        );
        const session = await eboekhoudenProvider.openSession({
            secret: 'access-token',
        });

        const found = await session.listMutations({
            dateFrom: '2026-10-01',
            limit: 50,
        });

        expect(found.map((row) => row.date)).toEqual(['2026-10-05']);
    });
});
