import { TRPCError } from '@trpc/server';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as postRecordingRoute } from '~/app/(app)/api/recording/[id]/route';

const mocks = vi.hoisted(() => ({ createRecording: vi.fn() }));

vi.mock('next/cache', () => ({
    cacheLife: vi.fn(),
    cacheTag: vi.fn(),
    revalidateTag: vi.fn(),
}));
vi.mock('~/environment', () => ({ environment: { NODE_ENV: 'test' } }));
vi.mock('~/server/db', () => ({ db: {} }));
vi.mock('~/lib/email', () => ({}));
vi.mock('~/lib/notify', () => ({ scheduleFanOut: vi.fn() }));
vi.mock('~/server/api/root', () => ({ createCaller: vi.fn() }));
vi.mock('~/trpc/server', () => ({
    api: { recording: { createRecording: mocks.createRecording } },
}));

const UNAUTHORIZED = 401;

beforeEach(() => {
    mocks.createRecording.mockReset();
});

describe('POST /api/recording/[id] authentication', () => {
    it('rejects an unauthenticated upload before decoding its audio', async () => {
        mocks.createRecording.mockRejectedValue(
            new TRPCError({ code: 'UNAUTHORIZED' }),
        );
        const upload = Buffer.from('not a wav file');
        const body = new Blob([new Uint8Array(upload)]);
        const request = new NextRequest('http://localhost/api/recording/42', {
            body,
            method: 'POST',
        });
        const response = await postRecordingRoute(request, {
            params: Promise.resolve({ id: '42' }),
        });

        expect(response.status).toBe(UNAUTHORIZED);
        expect(mocks.createRecording).toHaveBeenCalledExactlyOnceWith({
            device: { device_id: 42 },
            recording: upload,
        });
    });
});
