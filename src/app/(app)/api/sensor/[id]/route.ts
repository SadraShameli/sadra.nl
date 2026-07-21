import { type NextRequest, NextResponse } from 'next/server';

import { idPathParameterSchema, parseRouteParameters } from '~/lib/schemas/api';
import { api } from '~/trpc/server';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const parsed = parseRouteParameters(idPathParameterSchema, await params);
    if (parsed.response) return parsed.response;

    const result = await api.sensor.getSensor({ id: parsed.data.id });

    if (result.data) {
        return NextResponse.json(result.data, { status: result.status });
    }

    return NextResponse.json(result, { status: result.status });
}
