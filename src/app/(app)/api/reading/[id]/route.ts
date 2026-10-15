import { type NextRequest, NextResponse } from 'next/server';

import { idPathParameterSchema, parseRouteParameters } from '~/lib/schemas/api';
import { api } from '~/trpc/server';

export async function GET(
    request: NextRequest,
    { params }: RouteContext<'/api/reading/[id]'>,
) {
    const parsed = parseRouteParameters(idPathParameterSchema, await params);
    if (parsed.response) return parsed.response;

    const result = await api.reading.getReading({ id: parsed.data.id });

    return NextResponse.json(result.data ?? result, { status: result.status });
}
