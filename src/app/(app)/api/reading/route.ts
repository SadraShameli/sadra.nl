import { type NextRequest, NextResponse } from 'next/server';
import { type z } from 'zod';

import { type createReadingProps } from '~/server/api/types/zod';
import { api } from '~/trpc/server';

export async function GET() {
    const res = await api.reading.getReadings();

    if (res.data) {
        return NextResponse.json(res.data, { status: res.status });
    }

    return NextResponse.json(res, { status: res.status });
}

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as z.infer<
            typeof createReadingProps
        >;
        const res = await api.reading.createReading({
            device_id: body.device_id,
            sensors: body.sensors,
        });

        if (res.status == 201) {
            return new NextResponse(null, { status: res.status });
        }

        return NextResponse.json(res, { status: res.status });
    } catch (e) {
        return NextResponse.json(e, { status: 500 });
    }
}
