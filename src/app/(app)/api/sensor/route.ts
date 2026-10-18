import { NextResponse } from 'next/server';

import { readPublicSensors } from '~/server/iot/IotPublicReads';

export async function GET() {
    const result = await readPublicSensors();

    return NextResponse.json(result.data ?? result, { status: result.status });
}
