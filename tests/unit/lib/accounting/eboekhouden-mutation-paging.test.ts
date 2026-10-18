import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IsoDate } from '~/lib/accounting/core/date';
import { eboekhoudenProvider } from '~/lib/accounting/providers/eboekhouden/provider';

import { FakeEBoekhoudenApi, type FakeMutation } from './eboekhouden-fake-api';

const TODAY = new Date('2026-10-18T12:00:00');
const FIRST_BOOKING_DAY = IsoDate.parse('2025-06-01');
const BOOKINGS_PER_DAY = 6;
const BOOKED_DAYS = 494;
const PAGE = 25;
const API_PAGE_LIMIT = 2000;

const DAILY_BOOKINGS: FakeMutation[] = Array.from(
    { length: BOOKED_DAYS * BOOKINGS_PER_DAY },
    (_, index) => ({
        date: IsoDate.addDays(
            FIRST_BOOKING_DAY,
            Math.floor(index / BOOKINGS_PER_DAY),
        ),
        id: index + 1,
    }),
);
const LATE_ENTERED_OLD_BOOKING: FakeMutation = {
    date: '2025-07-02',
    id: DAILY_BOOKINGS.length + 1,
};
const LEDGER = [...DAILY_BOOKINGS, LATE_ENTERED_OLD_BOOKING];

function newestFirst(mutations: readonly FakeMutation[]): string[] {
    return mutations
        .toSorted((a, b) =>
            a.date === b.date ? b.id - a.id : b.date.localeCompare(a.date),
        )
        .map((mutation) => String(mutation.id));
}

async function openSession(secret: string) {
    return eboekhoudenProvider.openSession({ secret });
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(TODAY);
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('eBoekhouden listMutations', () => {
    it('starts with the newest bookings of the whole ledger, not the lowest ids', async () => {
        FakeEBoekhoudenApi.serve(LEDGER);
        const session = await openSession('newest-first');

        const firstPage = await session.listMutations({ limit: PAGE });
        const secondPage = await session.listMutations({
            limit: PAGE,
            offset: PAGE,
        });
        await session.close();

        expect(firstPage[0]?.date).toBe('2026-10-07');
        expect(
            [...firstPage, ...secondPage].map((row) => row.externalId),
        ).toEqual(newestFirst(LEDGER).slice(0, PAGE * 2));
    });

    it('keeps a booking entered late for an old date off the first page', async () => {
        FakeEBoekhoudenApi.serve(LEDGER);
        const session = await openSession('late-entry');

        const firstPage = await session.listMutations({ limit: PAGE });
        await session.close();

        expect(firstPage.map((row) => row.externalId)).not.toContain(
            String(LATE_ENTERED_OLD_BOOKING.id),
        );
    });

    it('returns only bookings inside a date range, newest first, past the first raw page', async () => {
        FakeEBoekhoudenApi.serve(LEDGER);
        const session = await openSession('date-range');

        const found = await session.listMutations({
            dateFrom: '2025-07-01',
            dateTo: '2025-07-02',
            limit: 50,
        });
        await session.close();

        expect(found.map((row) => row.externalId)).toEqual(
            newestFirst(
                LEDGER.filter(
                    (mutation) =>
                        mutation.date >= '2025-07-01' &&
                        mutation.date <= '2025-07-02',
                ),
            ),
        );
    });
});

describe('eBoekhouden latestMutationDate', () => {
    it('reads the latest booking date with one request instead of paging the whole ledger', async () => {
        const api = FakeEBoekhoudenApi.serve(LEDGER);
        const session = await openSession('latest-recent');

        const latest = await session.latestMutationDate();
        await session.close();

        expect(latest).toBe('2026-10-07');
        expect(api.mutationRequests).toHaveLength(1);
    });

    it('still finds a latest booking from years ago in a handful of requests', async () => {
        const api = FakeEBoekhoudenApi.serve([
            { date: '2021-03-04', id: 1 },
            { date: '2023-05-06', id: 2 },
        ]);
        const session = await openSession('latest-old');

        const latest = await session.latestMutationDate();
        await session.close();

        expect(latest).toBe('2023-05-06');
        expect(api.mutationRequests.length).toBeLessThanOrEqual(4);
    });

    it('counts a booking dated in the future as the latest', async () => {
        FakeEBoekhoudenApi.serve([...LEDGER, { date: '2026-12-31', id: 9999 }]);
        const session = await openSession('latest-future');

        const latest = await session.latestMutationDate();
        await session.close();

        expect(latest).toBe('2026-12-31');
    });

    it('reports no date for an empty ledger', async () => {
        FakeEBoekhoudenApi.serve([]);
        const session = await openSession('latest-empty');

        const latest = await session.latestMutationDate();
        await session.close();

        expect(latest).toBeNull();
    });
});

describe('eBoekhouden countMutations', () => {
    it('counts every mutation of the ledger and of a date range, not the size of one API page', async () => {
        const api = FakeEBoekhoudenApi.serve(LEDGER);
        const session = await openSession('count');

        const total = await session.countMutations({});
        const october = await session.countMutations({
            dateFrom: '2026-10-01',
            dateTo: '2026-10-07',
        });
        await session.close();

        expect(total).toBe(LEDGER.length);
        expect(october).toBe(7 * BOOKINGS_PER_DAY);
        expect(api.mutationRequests).toHaveLength(
            Math.ceil(LEDGER.length / API_PAGE_LIMIT) + 1,
        );
    });
});
