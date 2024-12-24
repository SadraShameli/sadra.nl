import { type NextRequest, NextResponse } from 'next/server';

import { applyAudioFilters } from '~/server/helpers/Audio';
import { api } from '~/trpc/server';

type RequestProps = {
    id: string;
};

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<RequestProps> },
) {
    const requestParams = await params;
    const res = await api.recording.getRecording({ id: +requestParams.id });

    if (res.data) {
        return new Response(res.data.file, {
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
    { params }: { params: Promise<RequestProps> },
) {
    const requestParams = await params;
    const buffer = Buffer.from(await (await request.blob()).arrayBuffer());
    const normalizedBuffer = applyAudioFilters(buffer);

    const res = await api.recording.createRecording({
        device: { device_id: +requestParams.id },
        recording: normalizedBuffer,
    });

    if (res.status == 201) {
        return new NextResponse(null, { status: res.status });
    }

    return NextResponse.json(res, {
        status: res.status,
    });
}
