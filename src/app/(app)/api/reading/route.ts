import { type NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { zodErrorResponse } from '~/lib/schemas/api';
import { readingCreateProperties } from '~/lib/schemas/sensor';
import { api } from '~/trpc/server';

export async function GET() {
    const result = await api.reading.getReadings();
    return NextResponse.json(result.data);
}

export async function POST(request: NextRequest) {
    try {
        const body = readingCreateProperties.parse(await request.json());
        const result = await api.reading.createReading(body);

        const status =
            'status' in result && typeof result.status === 'number'
                ? result.status
                : 500;

        return status === 201
            ? new NextResponse(null, { status: 201 })
            : NextResponse.json(result, { status });
    } catch (error) {
        return error instanceof ZodError
            ? zodErrorResponse(error)
            : NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
