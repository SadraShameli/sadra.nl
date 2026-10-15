import { type NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';

import {
    parseSearchParameters,
    readingsPageQuerySchema,
    zodErrorResponse,
} from '~/lib/schemas/api';
import { readingCreateProperties } from '~/lib/schemas/sensor';
import { markIotReadingsStale } from '~/server/iot/IotPublicReads';
import { api } from '~/trpc/server';

export async function GET(request: NextRequest) {
    const page = parseSearchParameters(readingsPageQuerySchema, request);
    if (page.response) return page.response;

    const result = await api.reading.getReadings(page.data);
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

        if (status !== 201) return NextResponse.json(result, { status });
        markIotReadingsStale();
        return new NextResponse(null, { status: 201 });
    } catch (error) {
        return error instanceof ZodError
            ? zodErrorResponse(error)
            : NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
