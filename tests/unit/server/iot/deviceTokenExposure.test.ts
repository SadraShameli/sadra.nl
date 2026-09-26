import { type inferRouterOutputs } from '@trpc/server';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { type PublicDevice } from '~/lib/schemas/sensor';
import { deviceRouter } from '~/server/api/routers/iot/device';
import { locationRouter } from '~/server/api/routers/iot/location';
import { createCallerFactory, createTRPCRouter } from '~/server/api/trpc';

import {
    createFakeDatabase,
    type FakeRow,
    type IssuedQuery,
} from '../fakeDatabase';

vi.mock('~/environment', () => ({ environment: { NODE_ENV: 'test' } }));
vi.mock('~/server/db', () => ({ db: {} }));
vi.mock('~/lib/auth/server', () => ({
    auth: { api: { getSession: vi.fn() } },
}));
vi.mock('~/lib/email', () => ({}));
vi.mock('~/lib/notify', () => ({ fanOutEvent: vi.fn() }));

const TOKEN_HASH = 'a'.repeat(64);

const DEVICE_ROW: FakeRow = {
    created_at: new Date('2026-01-01T00:00:00Z'),
    device_id: 42,
    id: 7,
    location_id: 3,
    loudness_threshold: 80,
    name: 'Kitchen',
    register_interval: 60,
    token_created_at: new Date('2026-02-01T00:00:00Z'),
    token_hash: TOKEN_HASH,
    token_revoked_at: null,
};

const LOCATION_ROW: FakeRow = {
    created_at: new Date('2026-01-01T00:00:00Z'),
    id: 3,
    location_id: 9,
    location_name: 'Home',
    name: 'Home',
};

const CREDENTIAL_KEYS = ['token_hash', 'token_created_at', 'token_revoked_at'];

type DeviceOutputs = inferRouterOutputs<typeof deviceRouter>;
type LocationOutputs = inferRouterOutputs<typeof locationRouter>;

type Session = null | { user: { email: string; id: string; role: string } };

function callerFor(session: Session) {
    const { database, queries } = createFakeDatabase(respond);
    const router = createTRPCRouter({
        device: deviceRouter,
        location: locationRouter,
    });
    const caller = createCallerFactory(router)({
        db: database,
        headers: new Headers(),
        session: session as never,
    });
    return { caller, queries };
}

function deviceQueries(queries: IssuedQuery[]): IssuedQuery[] {
    return queries.filter((q) => q.text.includes('from "sadranl_device"'));
}

function respond(query: IssuedQuery): FakeRow[] {
    if (query.text.includes('"sadranl_sensors_to_devices"')) {
        return [{ device_id: 7, sensor_id: 1 }];
    }
    if (query.text.includes('from "sadranl_location"')) return [LOCATION_ROW];
    return query.text.includes('from "sadranl_device"') ? [DEVICE_ROW] : [];
}

const ANONYMOUS: Session = null;
const SIGNED_IN: Session = {
    user: { email: 'someone@example.com', id: 'u1', role: 'user' },
};
const ADMIN: Session = {
    user: { email: 'admin@example.com', id: 'u2', role: 'admin' },
};

describe('device token exposure', () => {
    it('public device.getDevice never selects or returns token columns', async () => {
        const { caller, queries } = callerFor(ANONYMOUS);
        const result = await caller.device.getDevice({ device_id: 42 });

        expect(result.data).toBeDefined();
        for (const key of CREDENTIAL_KEYS) {
            expect(result.data).not.toHaveProperty(key);
        }
        expect(result.data).toMatchObject({
            device_id: 42,
            loudness_threshold: 80,
            name: 'Kitchen',
            register_interval: 60,
            sensors: [1],
        });
        for (const q of deviceQueries(queries)) {
            expect(q.text).not.toMatch(/token_/);
        }
    });

    it('public location.getLocationDevices never selects or returns token columns', async () => {
        const { caller, queries } = callerFor(ANONYMOUS);
        const result = await caller.location.getLocationDevices({
            location_id: 9,
        });

        expect(Array.isArray(result.data)).toBe(true);
        const rows = result.data as FakeRow[];
        expect(rows).toHaveLength(1);
        for (const key of CREDENTIAL_KEYS) {
            expect(rows[0]).not.toHaveProperty(key);
        }
        expect(rows[0]).toMatchObject({ device_id: 42, name: 'Kitchen' });
        for (const q of deviceQueries(queries)) {
            expect(q.text).not.toMatch(/token_/);
        }
    });

    it('device.getDevices never returns token columns to a signed-in non-admin', async () => {
        const { caller, queries } = callerFor(SIGNED_IN);
        const result = await caller.device.getDevices();

        expect(result.data).toHaveLength(1);
        for (const key of CREDENTIAL_KEYS) {
            expect(result.data[0]).not.toHaveProperty(key);
        }
        for (const q of deviceQueries(queries)) {
            expect(q.text).not.toMatch(/token_/);
        }
    });

    it('device.getDevices still rejects anonymous callers', async () => {
        const { caller } = callerFor(ANONYMOUS);
        await expect(caller.device.getDevices()).rejects.toMatchObject({
            code: 'UNAUTHORIZED',
        });
    });

    it('admin device.listAdmin exposes has_token instead of token_hash', async () => {
        const { caller } = callerFor(ADMIN);
        const rows = await caller.device.listAdmin();

        expect(rows).toHaveLength(1);
        expect(rows[0]).not.toHaveProperty('token_hash');
        expect(rows[0]).toMatchObject({
            has_token: true,
            token_created_at: DEVICE_ROW.token_created_at,
            token_revoked_at: null,
        });
        expect(JSON.stringify(rows)).not.toContain(TOKEN_HASH);
    });

    it('admin device.listAdmin reports has_token false when no token was issued', async () => {
        const { database } = createFakeDatabase((query) =>
            query.text.includes('from "sadranl_device"')
                ? [{ ...DEVICE_ROW, token_created_at: null, token_hash: null }]
                : [],
        );
        const caller = createCallerFactory(
            createTRPCRouter({ device: deviceRouter }),
        )({
            db: database,
            headers: new Headers(),
            session: ADMIN as never,
        });
        const rows = await caller.device.listAdmin();
        expect(rows[0]).toMatchObject({ has_token: false });
    });

    it('types every public device output as PublicDevice', () => {
        expectTypeOf<
            DeviceOutputs['getDevices']['data'][number]
        >().toEqualTypeOf<PublicDevice>();
        expectTypeOf<
            Extract<
                LocationOutputs['getLocationDevices']['data'],
                unknown[]
            >[number]
        >().toEqualTypeOf<PublicDevice>();
        expectTypeOf<
            NonNullable<DeviceOutputs['getDevice']['data']>
        >().toExtend<PublicDevice>();
    });

    it('types the admin list row with has_token and without token_hash', () => {
        type AdminRow = DeviceOutputs['listAdmin'][number];
        expectTypeOf<AdminRow>().not.toHaveProperty('token_hash');
        expectTypeOf<AdminRow['has_token']>().toEqualTypeOf<boolean>();
    });
});
