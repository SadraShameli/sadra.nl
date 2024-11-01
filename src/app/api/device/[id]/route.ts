import { type NextRequest, NextResponse } from 'next/server';

import { api } from '~/trpc/server';

type RequestProps = {
    id: string;
};

export async function GET(request: NextRequest, { params }: { params: Promise<RequestProps> }) {
    const requestParams = await params;

    const res = await api.device.getDevice({ device_id: +requestParams.id });

    if (res.data) {
        return NextResponse.json(res.data, { status: res.status });
    }

    return NextResponse.json(res, { status: res.status });
}
