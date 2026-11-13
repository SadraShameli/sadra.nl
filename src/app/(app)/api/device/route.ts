import { NextResponse } from 'next/server';

import { caller } from '~/trpc/server';

export async function GET() {
    const result = await caller.device.getDevices();
    return NextResponse.json(result.data);
}
