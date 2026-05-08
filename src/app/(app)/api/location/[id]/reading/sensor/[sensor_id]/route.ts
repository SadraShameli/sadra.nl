import { type NextRequest, NextResponse } from 'next/server';

import { api } from '~/trpc/server';

type RequestProps = {
    id: string;
    sensor_id: string;
};

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<RequestProps> },
) {
    const requestParams = await params;

    const res = await api.location.getLocationReadings({
        location: { location_id: +requestParams.id },
        sensor_id: +requestParams.sensor_id,
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
