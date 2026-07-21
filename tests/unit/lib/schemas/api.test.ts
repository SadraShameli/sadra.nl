import { describe, expect, it } from 'vitest';

import {
    idPathParameterSchema,
    idSensorPathParameterSchema,
    MAX_RECORDING_BYTES,
    parseRouteParameters,
    positiveIntIdSchema,
    recordingBlobSchema,
} from '~/lib/schemas/api';

describe('positiveIntIdSchema', () => {
    it('coerces a numeric string to an integer', () => {
        const r = positiveIntIdSchema.safeParse('42');
        expect(r.success).toBe(true);
        expect(r.data).toBe(42);
    });

    it('rejects zero and negatives', () => {
        expect(positiveIntIdSchema.safeParse('0').success).toBe(false);
        expect(positiveIntIdSchema.safeParse('-3').success).toBe(false);
    });

    it('rejects floats and garbage', () => {
        expect(positiveIntIdSchema.safeParse('3.14').success).toBe(false);
        expect(positiveIntIdSchema.safeParse('abc').success).toBe(false);
        expect(positiveIntIdSchema.safeParse('').success).toBe(false);
    });
});

describe('idPathParameterSchema', () => {
    it('accepts an `id` from a typical Next.js route param object', () => {
        const r = idPathParameterSchema.safeParse({ id: '7' });
        expect(r.success).toBe(true);
        expect(r.data?.id).toBe(7);
    });

    it('rejects missing id', () => {
        expect(idPathParameterSchema.safeParse({}).success).toBe(false);
    });
});

describe('idSensorPathParameterSchema', () => {
    it('accepts both ids', () => {
        const r = idSensorPathParameterSchema.safeParse({
            id: '1',
            sensor_id: '2',
        });
        expect(r.success).toBe(true);
        expect(r.data?.id).toBe(1);
        expect(r.data?.sensor_id).toBe(2);
    });

    it('rejects when sensor_id missing', () => {
        expect(idSensorPathParameterSchema.safeParse({ id: '1' }).success).toBe(
            false,
        );
    });
});

describe('recordingBlobSchema', () => {
    it('accepts a small blob', () => {
        const blob = new Blob([new Uint8Array(1024)]);
        const r = recordingBlobSchema.safeParse(blob);
        expect(r.success).toBe(true);
    });

    it('rejects empty blobs', () => {
        const blob = new Blob([]);
        const r = recordingBlobSchema.safeParse(blob);
        expect(r.success).toBe(false);
    });

    it('rejects blobs over the max size', () => {
        const blob = new Blob([new Uint8Array(MAX_RECORDING_BYTES + 1)]);
        const r = recordingBlobSchema.safeParse(blob);
        expect(r.success).toBe(false);
    });

    it('rejects non-blob values', () => {
        expect(recordingBlobSchema.safeParse({ size: 100 }).success).toBe(
            false,
        );
        expect(recordingBlobSchema.safeParse('not a blob').success).toBe(false);
    });
});

describe('parseRouteParameters', () => {
    it('returns data on success', () => {
        const r = parseRouteParameters(idPathParameterSchema, { id: '5' });
        expect(r.data?.id).toBe(5);
        expect(r.response).toBeUndefined();
    });

    it('returns a 400 NextResponse on failure', async () => {
        const r = parseRouteParameters(idPathParameterSchema, { id: 'nope' });
        expect(r.data).toBeUndefined();
        expect(r.response).toBeDefined();
        expect(r.response?.status).toBe(400);
        const body = (await r.response?.json()) as { error: string };
        expect(body.error).toBe('Invalid input');
    });
});
