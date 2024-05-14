import { type NextRequest, NextResponse } from 'next/server';

import { api } from '~/trpc/server';

interface RequestProps {
    id: string;
}

export async function GET(request: NextRequest, { params }: { params: RequestProps }) {
    const result = await api.recording.getRecording({ id: params.id });
    if (result.data) {
        const filename = `${result.data.createdAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}`;
        return new Response(result.data.file, {
            status: result.status,
            headers: { 'Content-Type': 'audio/wav', 'Content-Disposition': `attachment; filename=Recording ${result.data.id} - ${filename}.wav` },
        });
    }
    return NextResponse.json(result, { status: result.status });
}

export async function POST(request: NextRequest, { params }: { params: RequestProps }) {
    const deviceResult = await api.device.getDevice({ device_id: params.id });
    if (!deviceResult.data) {
        return NextResponse.json(deviceResult, { status: deviceResult.status });
    }

    const buffer = Buffer.from(await (await request.blob()).arrayBuffer());
    const recordingResult = await api.recording.createRecording({ device: { device_id: deviceResult.data.device_id.toString() }, recording: buffer });

    if (recordingResult.data) {
        return NextResponse.json(recordingResult.data, { status: recordingResult.status });
    }
    return NextResponse.json(recordingResult, { status: recordingResult.status });
}
