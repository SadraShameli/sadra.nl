import { NextResponse } from 'next/server';

import { api } from '~/trpc/server';

export async function GET() {
    const result = await api.recording.getRecordings();

    return result.data
        ? NextResponse.json(result.data, { status: result.status })
        : NextResponse.json(result, { status: result.status });
}
