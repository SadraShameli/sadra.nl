import { type NextRequest, NextResponse } from 'next/server';

import { idPathParamSchema, parseRouteParams } from '~/lib/schemas/api';
import { api } from '~/trpc/server';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const parsed = parseRouteParams(idPathParamSchema, await params);
    if (parsed.response) return parsed.response;

    const res = await api.device.getDevice({ device_id: parsed.data.id });

    if (res.data) {
        return NextResponse.json(res.data, { status: res.status });
    }

    return NextResponse.json(res, { status: res.status });
}
