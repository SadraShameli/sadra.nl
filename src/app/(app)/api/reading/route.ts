import { type NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { zodErrorResponse } from '~/lib/schemas/api';
import { createReadingProps } from '~/lib/schemas/sensor';
import { api } from '~/trpc/server';

export async function GET() {
    const res = await api.reading.getReadings();
    return NextResponse.json(res.data);
}

export async function POST(request: NextRequest) {
    try {
        const body = createReadingProps.parse(await request.json());
        const res = await api.reading.createReading(body);

        const status =
            'status' in res && typeof res.status === 'number'
                ? res.status
                : 500;

        if (status === 201) {
            return new NextResponse(null, { status: 201 });
        }

        return NextResponse.json(res, { status });
    } catch (error) {
        if (error instanceof ZodError) return zodErrorResponse(error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
