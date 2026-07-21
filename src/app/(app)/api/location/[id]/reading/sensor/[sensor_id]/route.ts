import { type NextRequest, NextResponse } from 'next/server';

import {
    idSensorPathParameterSchema,
    parseRouteParameters,
} from '~/lib/schemas/api';
import { api } from '~/trpc/server';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; sensor_id: string }> },
) {
    const parsed = parseRouteParameters(
        idSensorPathParameterSchema,
        await params,
    );
    if (parsed.response) return parsed.response;

    const result = await api.location.getLocationReadings({
        location: { location_id: parsed.data.id },
        sensor_id: parsed.data.sensor_id,
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
