import { type NextRequest, NextResponse } from 'next/server';

import { api } from '~/trpc/server';

interface RequestProps {
  id: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: RequestProps },
) {
  const result = await api.recording.getRecording({ id: params.id });
  if (result.data) {
    return new Response(result.data.file, {
      status: result.status,
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Length': result.data.file.length.toString(),
        'Content-Type': 'audio/wav',
        'Content-Disposition': `attachment; filename="${result.data.fileName}"`,
      },
    });
  }
  return NextResponse.json(result, { status: result.status });
}

export async function POST(
  request: NextRequest,
  { params }: { params: RequestProps },
) {
  const buffer = Buffer.from(await (await request.blob()).arrayBuffer());
  const recordingResult = await api.recording.createRecording({
    device: { device_id: params.id },
    recording: buffer,
  });

  if (recordingResult.data) {
    return NextResponse.json({}, { status: recordingResult.status });
  }
  return NextResponse.json(recordingResult, {
    status: recordingResult.status,
  });
}
