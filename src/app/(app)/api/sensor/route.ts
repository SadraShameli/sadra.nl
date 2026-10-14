import { NextResponse } from 'next/server';

import { api } from '~/trpc/server';

export async function GET() {
    const result = await api.sensor.getSensors();

    return NextResponse.json(result.data ?? result, { status: result.status });
}
