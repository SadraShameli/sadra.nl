import { type NextRequest, NextResponse } from 'next/server';

import {
    idSensorPathParameterSchema,
    parseRouteParameters,
    parseSearchParameters,
    readingsPageQuerySchema,
} from '~/lib/schemas/api';
import { readPublicDeviceReadings } from '~/server/iot/IotPublicReads';

export async function GET(
    request: NextRequest,
    { params }: RouteContext<'/api/device/[id]/reading/sensor/[sensor_id]'>,
) {
    const parsed = parseRouteParameters(
        idSensorPathParameterSchema,
        await params,
    );
    if (parsed.response) return parsed.response;
    const page = parseSearchParameters(readingsPageQuerySchema, request);
    if (page.response) return page.response;

    const result = await readPublicDeviceReadings({
        ...page.data,
        device: { device_id: parsed.data.id },
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
