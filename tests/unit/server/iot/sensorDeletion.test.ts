import { describe, expect, it, vi } from 'vitest';

import { sensorRouter } from '~/server/api/routers/iot/sensor';
import { createCallerFactory, createTRPCRouter } from '~/server/api/trpc';

import {
    createFakeDatabase,
    FakeDatabaseError,
    type IssuedQuery,
    TransactionStep,
    transactionSteps,
    writeTable,
} from '../fakeDatabase';

vi.mock('~/environment', () => ({ environment: { NODE_ENV: 'test' } }));
vi.mock('~/server/db', () => ({ db: {} }));
vi.mock('~/lib/auth/server', () => ({
    auth: { api: { getSession: vi.fn() } },
}));
vi.mock('~/lib/email', () => ({}));
vi.mock('~/lib/notify', () => ({ scheduleFanOut: vi.fn() }));

const ADMIN = {
    user: { email: 'admin@x.test', id: 'admin-1', role: 'admin' },
};
const SENSOR_TABLE = 'sadranl_sensor';
const MAPPING_TABLE = 'sadranl_sensors_to_devices';

function adminCaller(respond: (query: IssuedQuery) => never[]) {
    const { database, queries } = createFakeDatabase(respond);
    const caller = createCallerFactory(
        createTRPCRouter({ sensor: sensorRouter }),
    )({ db: database, headers: new Headers(), session: ADMIN as never });
    return { caller, queries };
}

describe('sensor.delete', () => {
    it('keeps the device mappings when readings block the sensor deletion', async () => {
        const { caller, queries } = adminCaller((query) => {
            if (writeTable(query) === SENSOR_TABLE) {
                throw new FakeDatabaseError(
                    '23503',
                    'sadranl_reading_sensor_id_fk',
                );
            }
            return [];
        });

        await expect(caller.sensor.delete({ id: 5 })).rejects.toThrow();

        expect(
            queries.some((query) => writeTable(query) === MAPPING_TABLE),
        ).toBe(true);
        expect(transactionSteps(queries)).toEqual([
            TransactionStep.Begin,
            TransactionStep.Rollback,
        ]);
    });
});

describe('sensor.setDeviceSensors', () => {
    it('restores the previous mappings when the replacement insert fails', async () => {
        const { caller, queries } = adminCaller((query) => {
            if (/^insert into/i.test(query.text)) {
                throw new FakeDatabaseError(
                    '23503',
                    'sadranl_sensors_to_devices_sensor_id_fk',
                );
            }
            return [];
        });

        await expect(
            caller.sensor.setDeviceSensors({ deviceId: 2, sensorIds: [99] }),
        ).rejects.toThrow();

        expect(transactionSteps(queries)).toEqual([
            TransactionStep.Begin,
            TransactionStep.Rollback,
        ]);
    });
});
