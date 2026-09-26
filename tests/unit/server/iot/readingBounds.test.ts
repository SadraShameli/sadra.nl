import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as getDeviceReadingsRoute } from '~/app/(app)/api/device/[id]/reading/route';
import { GET as getLocationReadingsRoute } from '~/app/(app)/api/location/[id]/reading/route';
import { GET as getReadingsRoute } from '~/app/(app)/api/reading/route';
import { deviceRouter } from '~/server/api/routers/iot/device';
import { locationRouter } from '~/server/api/routers/iot/location';
import { readingRouter } from '~/server/api/routers/iot/reading';
import { createCallerFactory, createTRPCRouter } from '~/server/api/trpc';

import {
    createFakeDatabase,
    type FakeRow,
    type IssuedQuery,
} from '../fakeDatabase';

const current = vi.hoisted((): { api: Record<string, unknown> } => ({
    api: {},
}));

vi.mock('~/environment', () => ({ environment: { NODE_ENV: 'test' } }));
vi.mock('~/server/db', () => ({ db: {} }));
vi.mock('~/lib/auth/server', () => ({
    auth: { api: { getSession: vi.fn() } },
}));
vi.mock('~/lib/email', () => ({}));
vi.mock('~/lib/notify', () => ({ fanOutEvent: vi.fn() }));
vi.mock('~/trpc/server', () => ({
    api: new Proxy(
        {},
        {
            get: (_target, key: string) => current.api[key],
        },
    ),
}));

const LOCATION_ROW: FakeRow = {
    created_at: new Date('2026-01-01T00:00:00Z'),
    id: 3,
    location_id: 9,
    location_name: 'Home',
    name: 'Home',
};

const DEVICE_ROW: FakeRow = {
    created_at: new Date('2026-01-01T00:00:00Z'),
    device_id: 42,
    id: 7,
    location_id: 3,
    loudness_threshold: 80,
    name: 'Kitchen',
    register_interval: 60,
    token_created_at: null,
    token_hash: null,
    token_revoked_at: null,
};

function expectNewestFirst(query: IssuedQuery): void {
    expect(query.text).toMatch(/order by (?:"\w+"\.)?"id" desc/i);
}

function limitOf(query: IssuedQuery): unknown {
    const match = /\blimit \$(\d+)/i.exec(query.text);
    return match?.[1] ? query.params[Number(match[1]) - 1] : undefined;
}

function onlyReadingQuery(queries: IssuedQuery[]): IssuedQuery {
    const [match, ...rest] = readingQueries(queries);
    expect(rest).toHaveLength(0);
    if (!match) throw new Error('Expected exactly one reading query');
    return match;
}

function readingQueries(queries: IssuedQuery[]): IssuedQuery[] {
    return queries.filter((q) => q.text.includes('from "sadranl_reading"'));
}

function respond(query: IssuedQuery): FakeRow[] {
    if (query.text.includes('"sadranl_sensors_to_devices"')) return [];
    if (query.text.includes('from "sadranl_location"')) return [LOCATION_ROW];
    return query.text.includes('from "sadranl_device"') ? [DEVICE_ROW] : [];
}

function setup() {
    const { database, queries } = createFakeDatabase(respond);
    const caller = createCallerFactory(
        createTRPCRouter({
            device: deviceRouter,
            location: locationRouter,
            reading: readingRouter,
        }),
    )({ db: database, headers: new Headers(), session: null });
    current.api = caller;
    return { caller, queries };
}

beforeEach(() => {
    current.api = {};
});

describe('reading.getReadings bounds', () => {
    it('applies a default limit with newest-first ordering', async () => {
        const { caller, queries } = setup();
        await caller.reading.getReadings();
        const query = onlyReadingQuery(queries);
        expectNewestFirst(query);
        expect(limitOf(query)).toBe(100);
    });

    it('pages with a cursor and a caller-chosen limit', async () => {
        const { caller, queries } = setup();
        await caller.reading.getReadings({ cursor: 50, limit: 10 });
        const query = onlyReadingQuery(queries);
        expect(query.text).toMatch(/"id" < \$\d+/);
        expect(query.params).toContain(50);
        expect(limitOf(query)).toBe(10);
    });

    it('rejects a limit above the hard maximum', async () => {
        const { caller } = setup();
        await expect(
            caller.reading.getReadings({ limit: 501 }),
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
});

describe('GET /api/reading bounds', () => {
    it('rejects a non-numeric limit with 400', async () => {
        setup();
        const response = await getReadingsRoute(
            new NextRequest('http://localhost/api/reading?limit=abc'),
        );
        expect(response.status).toBe(400);
    });

    it('rejects a limit above the hard maximum with 400', async () => {
        setup();
        const response = await getReadingsRoute(
            new NextRequest('http://localhost/api/reading?limit=100000'),
        );
        expect(response.status).toBe(400);
    });

    it('forwards limit and cursor query params and still returns a JSON array', async () => {
        const { queries } = setup();
        const response = await getReadingsRoute(
            new NextRequest('http://localhost/api/reading?limit=5&cursor=10'),
        );
        expect(response.status).toBe(200);
        expect(Array.isArray(await response.json())).toBe(true);
        const query = onlyReadingQuery(queries);
        expect(limitOf(query)).toBe(5);
        expect(query.params).toContain(10);
    });
});

describe('location.getLocationReadings bounds', () => {
    it('applies a default limit with newest-first ordering', async () => {
        const { caller, queries } = setup();
        await caller.location.getLocationReadings({
            location: { location_id: 9 },
        });
        const query = onlyReadingQuery(queries);
        expectNewestFirst(query);
        expect(limitOf(query)).toBe(100);
    });

    it('forwards the REST limit query param', async () => {
        const { queries } = setup();
        const response = await getLocationReadingsRoute(
            new NextRequest('http://localhost/api/location/9/reading?limit=7'),
            { params: Promise.resolve({ id: '9' }) },
        );
        expect(response.status).toBe(200);
        expect(limitOf(onlyReadingQuery(queries))).toBe(7);
    });
});

describe('device.getDeviceReadings bounds', () => {
    it('applies a default limit with newest-first ordering', async () => {
        const { caller, queries } = setup();
        await caller.device.getDeviceReadings({ device: { device_id: 42 } });
        const query = onlyReadingQuery(queries);
        expectNewestFirst(query);
        expect(limitOf(query)).toBe(100);
    });

    it('forwards the REST limit query param', async () => {
        const { queries } = setup();
        const response = await getDeviceReadingsRoute(
            new NextRequest('http://localhost/api/device/42/reading?limit=3'),
            { params: Promise.resolve({ id: '42' }) },
        );
        expect(response.status).toBe(200);
        expect(limitOf(onlyReadingQuery(queries))).toBe(3);
    });
});

describe('reading.getReadingsInput bounds', () => {
    const TO = new Date('2026-09-25T00:00:00Z');
    const DAY_MS = 24 * 60 * 60 * 1000;

    it.each([
        ['raw', 7],
        ['hour', 90],
    ] as const)(
        'caps the %s series at the widest allowed range of %i days',
        async (granularity, days) => {
            const { caller, queries } = setup();
            await caller.reading.getReadingsInput({
                date_from: new Date(TO.getTime() - days * DAY_MS),
                date_to: TO,
                granularity,
                location_id: 3,
            });
            const query = onlyReadingQuery(queries);
            expect(limitOf(query)).toBe(10_000);
        },
    );

    it.each(['raw', 'hour', 'day', 'week', 'month'] as const)(
        'rejects an epoch-to-now %s range before touching the database',
        async (granularity) => {
            const { caller, queries } = setup();
            await expect(
                caller.reading.getReadingsInput({
                    date_from: new Date(0),
                    date_to: TO,
                    granularity,
                    location_id: 3,
                }),
            ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
            expect(queries).toHaveLength(0);
        },
    );

    it('rejects an inverted range before touching the database', async () => {
        const { caller, queries } = setup();
        const dayBefore = new Date(TO.getTime() - DAY_MS);
        await expect(
            caller.reading.getReadingsInput({
                date_from: TO,
                date_to: dayBefore,
                granularity: 'hour',
                location_id: 3,
            }),
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
        expect(queries).toHaveLength(0);
    });
});
