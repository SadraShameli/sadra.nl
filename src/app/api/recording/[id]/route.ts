import { type NextRequest, NextResponse } from 'next/server';

import { applyAudioFilters } from '~/server/helpers/Audio';
import { api } from '~/trpc/server';

type RequestProps = {
    id: string;
};

export async function GET(request: NextRequest, { params }: { params: RequestProps }) {
    const result = await api.recording.getRecording({ id: +params.id });
    if (result.data) {
        return new Response(result.data.file, {
            status: result.status,
            headers: {
                'Accept-Ranges': 'bytes',
                'Content-Length': result.data.file.length.toString(),
                'Content-Type': 'audio/wav',
                'Content-Disposition': `attachment; filename="${result.data.file_name}"`,
            },
        });
    }
    return NextResponse.json(result, { status: result.status });
}

export async function POST(request: NextRequest, { params }: { params: RequestProps }) {
    const buffer = Buffer.from(await (await request.blob()).arrayBuffer());
    const normalizedBuffer = applyAudioFilters(buffer);

    const result = await api.recording.createRecording({
        device: { device_id: +params.id },
        recording: normalizedBuffer,
    });

    if (result.status == 201) {
        return new NextResponse(null, { status: result.status });
    }
    return NextResponse.json(result, {
        status: result.status,
    });
}
