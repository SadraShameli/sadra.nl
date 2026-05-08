import { NextResponse } from 'next/server';

import { api } from '~/trpc/server';

export async function GET() {
    const res = await api.device.getDevices();
    return NextResponse.json(res.data);
}
