import { NextResponse } from 'next/server';

import { api } from '~/trpc/server';

export async function GET() {
    const result = await api.device.getDevices();
    return NextResponse.json(result.data);
}
