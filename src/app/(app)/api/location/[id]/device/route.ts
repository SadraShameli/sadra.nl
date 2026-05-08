import { type NextRequest, NextResponse } from 'next/server';

import { api } from '~/trpc/server';

type RequestProps = {
    id: string;
};

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<RequestProps> },
) {
    const requestParams = await params;

    const res = await api.location.getLocationDevices({
        location_id: +requestParams.id,
    });

    if (!res.data) {
        const status =
            'status' in res && typeof res.status === 'number'
                ? res.status
                : 500;
        return NextResponse.json(res, { status });
    }

    return NextResponse.json(res.data);
}
