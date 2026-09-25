import { type NextRequest, NextResponse } from 'next/server';

import {
    idPathParameterSchema,
    parseRouteParameters,
    parseSearchParameters,
    readingsPageQuerySchema,
} from '~/lib/schemas/api';
import { api } from '~/trpc/server';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const parsed = parseRouteParameters(idPathParameterSchema, await params);
    if (parsed.response) return parsed.response;
    const page = parseSearchParameters(readingsPageQuerySchema, request);
    if (page.response) return page.response;

    const result = await api.location.getLocationReadings({
        ...page.data,
        location: { location_id: parsed.data.id },
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
