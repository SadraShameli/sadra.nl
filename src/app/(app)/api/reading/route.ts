import { type NextRequest, NextResponse } from 'next/server';
import { type z } from 'zod';

import { type createReadingProps } from '~/server/api/types/zod';
import { api } from '~/trpc/server';

export async function GET() {
    const res = await api.reading.getReadings();
    return NextResponse.json(res.data);
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

        const status =
            'status' in res && typeof res.status === 'number'
                ? res.status
                : 500;

        if (status === 201) {
            return new NextResponse(null, { status: 201 });
        }

        return NextResponse.json(res, { status });
    } catch (e) {
        return NextResponse.json({ error: String(e) }, { status: 500 });
    }
}
