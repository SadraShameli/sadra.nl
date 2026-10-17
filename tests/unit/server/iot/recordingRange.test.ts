import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as getRecordingRoute } from '~/app/(app)/api/recording/[id]/route';

const mocks = vi.hoisted(() => ({ getRecording: vi.fn() }));

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
    api: { recording: { getRecording: mocks.getRecording } },
}));

const PARTIAL_CONTENT = 206;
const RANGE_NOT_SATISFIABLE = 416;
const FILE_SIZE = 100;

async function requestRange(range: string): Promise<Response> {
    const request = new NextRequest('http://localhost/api/recording/7', {
        headers: { range },
    });
    return getRecordingRoute(request, { params: Promise.resolve({ id: '7' }) });
}

beforeEach(() => {
    mocks.getRecording.mockReset();
    mocks.getRecording.mockResolvedValue({
        data: { file: Buffer.alloc(FILE_SIZE, 1), file_name: 'clip.wav' },
        status: 200,
    });
});

describe('GET /api/recording/[id] ranges', () => {
    it('clamps a range that ends past the file to its last byte', async () => {
        const response = await requestRange('bytes=0-999');
        expect(response.status).toBe(PARTIAL_CONTENT);
        expect(response.headers.get('Content-Range')).toBe(
            `bytes 0-${FILE_SIZE - 1}/${FILE_SIZE}`,
        );
        const body = await response.arrayBuffer();
        expect(body.byteLength).toBe(FILE_SIZE);
    });

    it('rejects a range that starts past the file', async () => {
        const response = await requestRange('bytes=100-199');
        expect(response.status).toBe(RANGE_NOT_SATISFIABLE);
    });
});
