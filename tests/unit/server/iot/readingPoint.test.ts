import { describe, expect, it, vi } from 'vitest';

import { readingPointOf } from '~/server/api/routers/iot/reading';

vi.mock('~/environment', () => ({ environment: { NODE_ENV: 'test' } }));
vi.mock('~/server/db', () => ({ db: {} }));
vi.mock('~/lib/auth/server', () => ({
    auth: { api: { getSession: vi.fn() } },
}));
vi.mock('~/lib/email', () => ({}));
vi.mock('~/lib/notify', () => ({ scheduleFanOut: vi.fn() }));

const BUCKET_MS = Date.parse('2026-05-15T08:00:00Z');

const ROW = { avg: 21.456, max: 22, min: 21, sensor_id: 5 };

describe('a chart point built from a bucket of readings', () => {
    it('takes the time of a grouped bucket that the driver returns as text', () => {
        expect(
            readingPointOf({ ...ROW, bucket: '2026-05-15 08:00:00+00' }),
        ).toEqual({ at: BUCKET_MS, value: 21.46 });
    });

    it('takes the time of a raw reading that arrives as a date', () => {
        expect(readingPointOf({ ...ROW, bucket: new Date(BUCKET_MS) })).toEqual(
            { at: BUCKET_MS, value: 21.46 },
        );
    });
});
