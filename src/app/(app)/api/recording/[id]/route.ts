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

    if (res.data) {
        return new Response(new Uint8Array(res.data.file), {
            status: res.status,
            headers: {
                'Accept-Ranges': 'bytes',
                'Content-Length': res.data.file.length.toString(),
                'Content-Type': 'audio/wav',
                'Content-Disposition': `attachment; filename="${res.data.file_name}"`,
            },
        });
    }

    return NextResponse.json(res, { status: res.status });
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
        const normalizedBuffer = applyAudioFilters(buffer);

        const res = await api.recording.createRecording({
            device: { device_id: parsed.data.id },
            recording: normalizedBuffer,
        });

        if (res.status == 201) {
            return new NextResponse(null, { status: res.status });
        }

        return NextResponse.json(res, { status: res.status });
    } catch (e) {
        if (e instanceof ZodError) return zodErrorResponse(e);
        return NextResponse.json({ error: String(e) }, { status: 500 });
    }
}
