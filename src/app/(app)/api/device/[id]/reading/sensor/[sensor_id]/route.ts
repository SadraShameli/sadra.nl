import { type NextRequest, NextResponse } from 'next/server';

import { idSensorPathParamSchema, parseRouteParams } from '~/lib/schemas/api';
import { api } from '~/trpc/server';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; sensor_id: string }> },
) {
    const parsed = parseRouteParams(idSensorPathParamSchema, await params);
    if (parsed.response) return parsed.response;

    const res = await api.device.getDeviceReadings({
        device: { device_id: parsed.data.id },
        sensor_id: parsed.data.sensor_id,
    });

    if (!res.data) {
        const status =
            'status' in res && typeof res.status === 'number'
                ? res.status
                : 500;
        return NextResponse.json(res, { status });
    }

    return NextResponse.json(res.data);
}
