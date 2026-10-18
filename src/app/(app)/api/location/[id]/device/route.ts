import { type NextRequest, NextResponse } from 'next/server';

import { idPathParameterSchema, parseRouteParameters } from '~/lib/schemas/api';
import { readPublicLocationDevices } from '~/server/iot/IotPublicReads';

export async function GET(
    request: NextRequest,
    { params }: RouteContext<'/api/location/[id]/device'>,
) {
    const parsed = parseRouteParameters(idPathParameterSchema, await params);
    if (parsed.response) return parsed.response;

    const result = await readPublicLocationDevices({
        location_id: parsed.data.id,
    });

    if (!result.data) {
        const status =
            'status' in result && typeof result.status === 'number'
                ? result.status
                : 500;
        return NextResponse.json(result, { status });
    }

    return NextResponse.json(result.data);
}
