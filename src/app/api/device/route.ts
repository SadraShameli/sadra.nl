import { NextResponse } from 'next/server';

import { api } from '~/trpc/server';

export async function GET() {
    const res = await api.device.getDevices();

    if (res.data) {
        return NextResponse.json(res.data, { status: res.status });
    }

    return NextResponse.json(res, { status: res.status });
}
