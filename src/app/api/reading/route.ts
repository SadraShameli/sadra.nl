import { type NextRequest, NextResponse } from 'next/server';
import { type z } from 'zod';

import { type createReadingProps } from '~/server/api/types/zod';
import { api } from '~/trpc/server';

export async function GET() {
    const result = await api.reading.getReadings();
    if (result.data) {
        return NextResponse.json(result.data, { status: result.status });
    }
    return NextResponse.json(result, { status: result.status });
}

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as z.infer<typeof createReadingProps>;
        const result = await api.reading.createReading({
            device_id: body.device_id,
            sensors: body.sensors,
        });
        if (result.status == 201) {
            return new NextResponse(null, { status: result.status });
        }
        return NextResponse.json(result, { status: result.status });
    } catch (e) {
        return NextResponse.json(e, { status: 500 });
    }
}
