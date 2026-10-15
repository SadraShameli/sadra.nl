import { type NextRequest, NextResponse } from 'next/server';

import { idPathParameterSchema, parseRouteParameters } from '~/lib/schemas/api';
import { readPublicLocation } from '~/server/iot/IotPublicReads';

export async function GET(
    request: NextRequest,
    { params }: RouteContext<'/api/location/[id]'>,
) {
    const parsed = parseRouteParameters(idPathParameterSchema, await params);
    if (parsed.response) return parsed.response;

    const result = await readPublicLocation({
        location_id: parsed.data.id,
    });

    return NextResponse.json(result.data ?? result, { status: result.status });
}
