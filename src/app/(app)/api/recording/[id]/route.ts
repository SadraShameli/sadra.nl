import { type NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';

import {
    idPathParamSchema,
    parseRouteParams,
    recordingBlobSchema,
    zodErrorResponse,
} from '~/lib/schemas/api';
import { applyAudioFilters } from '~/server/helpers/Audio';
import { api } from '~/trpc/server';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const parsed = parseRouteParams(idPathParamSchema, await params);
    if (parsed.response) return parsed.response;

    const res = await api.recording.getRecording({ id: parsed.data.id });

    if (!res.data) {
        return NextResponse.json(res, { status: res.status });
    }

    const file = res.data.file;
    const size = file.length;
    const range = parseRangeHeader(request.headers.get('range'), size);

    const baseHeaders = {
        'Accept-Ranges': 'bytes',
        'Content-Disposition': `attachment; filename="${res.data.file_name}"`,
        'Content-Type': 'audio/wav',
    };

    if (range) {
        const slice = file.subarray(range.start, range.end + 1);
        return new Response(new Uint8Array(slice), {
            headers: {
                ...baseHeaders,
                'Content-Length': slice.length.toString(),
                'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
            },
            status: 206,
        });
    }

    if (request.headers.get('range') !== null) {
        return new Response(null, {
            headers: { ...baseHeaders, 'Content-Range': `bytes */${size}` },
            status: 416,
        });
    }

    return new Response(new Uint8Array(file), {
        headers: { ...baseHeaders, 'Content-Length': size.toString() },
        status: 200,
    });
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const parsed = parseRouteParams(idPathParamSchema, await params);
    if (parsed.response) return parsed.response;

    try {
        const blob = recordingBlobSchema.parse(await request.blob());
        const buffer = Buffer.from(await blob.arrayBuffer());
        const { buffer: normalizedBuffer, durationSeconds } =
            applyAudioFilters(buffer);

        const res = await api.recording.createRecording({
            device: { device_id: parsed.data.id },
            duration_seconds: durationSeconds,
            recording: normalizedBuffer,
        });

        if (res.status == 201) {
            return new NextResponse(null, { status: res.status });
        }

        return NextResponse.json(res, { status: res.status });
    } catch (error) {
        if (error instanceof ZodError) return zodErrorResponse(error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}

function parseRangeHeader(
    header: null | string,
    size: number,
): null | { end: number; start: number } {
    if (!header) return null;
    const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
    if (!match) return null;
    const [, rawStart, rawEnd] = match;
    if (rawStart === '' && rawEnd === '') return null;
    let start: number;
    let end: number;
    if (rawStart === '') {
        const suffix = Number(rawEnd);
        if (!Number.isFinite(suffix) || suffix <= 0) return null;
        start = Math.max(0, size - suffix);
        end = size - 1;
    } else {
        start = Number(rawStart);
        end = rawEnd === '' ? size - 1 : Number(rawEnd);
    }
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    if (start < 0 || end >= size || start > end) return null;
    return { end, start };
}
