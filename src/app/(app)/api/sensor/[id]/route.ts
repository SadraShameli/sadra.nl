import { type NextRequest, NextResponse } from 'next/server';

import { idPathParameterSchema, parseRouteParameters } from '~/lib/schemas/api';
import { readPublicSensor } from '~/server/iot/IotPublicReads';

export async function GET(
    request: NextRequest,
    { params }: RouteContext<'/api/sensor/[id]'>,
) {
    const parsed = parseRouteParameters(idPathParameterSchema, await params);
    if (parsed.response) return parsed.response;

    const result = await readPublicSensor({ id: parsed.data.id });

    return NextResponse.json(result.data ?? result, { status: result.status });
}
