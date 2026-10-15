import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as postReadingRoute } from '~/app/(app)/api/reading/route';
import { POST as postRecordingRoute } from '~/app/(app)/api/recording/[id]/route';
import { type ContextType } from '~/server/api/trpc';
import { IotCacheTag, readPublicLocations } from '~/server/iot/IotPublicReads';

const mocks = vi.hoisted(() => ({
    createCaller: vi.fn<(context: ContextType) => unknown>(),
    createReading: vi.fn(),
    createRecording: vi.fn(),
    revalidateTag: vi.fn(),
}));

vi.mock('next/cache', () => ({
    cacheLife: vi.fn(),
    cacheTag: vi.fn(),
    revalidateTag: mocks.revalidateTag,
}));
vi.mock('~/environment', () => ({ environment: { NODE_ENV: 'test' } }));
vi.mock('~/server/db', () => ({ db: {} }));
vi.mock('~/lib/email', () => ({}));
vi.mock('~/lib/notify', () => ({ scheduleFanOut: vi.fn() }));
vi.mock('~/server/api/root', () => ({ createCaller: mocks.createCaller }));
vi.mock('~/server/helpers/audio', () => ({
    applyAudioFilters: (buffer: Buffer) => ({ buffer, durationSeconds: 1 }),
}));
vi.mock('~/trpc/server', () => ({
    api: {
        reading: { createReading: mocks.createReading },
        recording: { createRecording: mocks.createRecording },
    },
}));

const CREATED = 201;
const FORBIDDEN = 403;
const REVALIDATE_PROFILE = 'max';

function readingRequest(): NextRequest {
    return new NextRequest('http://localhost/api/reading', {
        body: JSON.stringify({ device_id: 42, sensors: { '1': 7 } }),
        method: 'POST',
    });
}

function recordingContext(): RouteContext<'/api/recording/[id]'> {
    return { params: Promise.resolve({ id: '42' }) };
}

function recordingRequest(): NextRequest {
    return new NextRequest('http://localhost/api/recording/42', {
        body: new Blob([new Uint8Array([1, 2, 3])]),
        method: 'POST',
    });
}

beforeEach(() => {
    mocks.createReading.mockReset();
    mocks.createRecording.mockReset();
    mocks.revalidateTag.mockReset();
    mocks.createCaller.mockReset();
});

describe('cached public IoT reads', () => {
    it('read through a caller with no request headers and no session', async () => {
        const locations = { data: [] };
        mocks.createCaller.mockReturnValue({
            location: { getLocations: () => Promise.resolve(locations) },
        });
        await expect(readPublicLocations()).resolves.toBe(locations);
        const context = mocks.createCaller.mock.calls[0]?.[0];
        expect(context).toMatchObject({ db: {}, session: null });
        expect([...(context?.headers.keys() ?? ['missing'])]).toEqual([]);
    });
});

describe('POST /api/reading cache invalidation', () => {
    it('marks the cached readings stale after a stored reading', async () => {
        mocks.createReading.mockResolvedValue({ status: CREATED });
        const response = await postReadingRoute(readingRequest());
        expect(response.status).toBe(CREATED);
        expect(mocks.revalidateTag).toHaveBeenCalledExactlyOnceWith(
            IotCacheTag.Readings,
            REVALIDATE_PROFILE,
        );
    });

    it('leaves the cache alone when the reading is rejected', async () => {
        mocks.createReading.mockResolvedValue({ status: FORBIDDEN });
        const response = await postReadingRoute(readingRequest());
        expect(response.status).toBe(FORBIDDEN);
        expect(mocks.revalidateTag).not.toHaveBeenCalled();
    });
});

describe('POST /api/recording/[id] cache invalidation', () => {
    it('marks the cached recordings stale after a stored recording', async () => {
        mocks.createRecording.mockResolvedValue({ status: CREATED });
        const response = await postRecordingRoute(
            recordingRequest(),
            recordingContext(),
        );
        expect(response.status).toBe(CREATED);
        expect(mocks.revalidateTag).toHaveBeenCalledExactlyOnceWith(
            IotCacheTag.Recordings,
            REVALIDATE_PROFILE,
        );
    });

    it('leaves the cache alone when the recording is rejected', async () => {
        mocks.createRecording.mockResolvedValue({ status: FORBIDDEN });
        const response = await postRecordingRoute(
            recordingRequest(),
            recordingContext(),
        );
        expect(response.status).toBe(FORBIDDEN);
        expect(mocks.revalidateTag).not.toHaveBeenCalled();
    });
});
