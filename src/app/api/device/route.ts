import { NextResponse } from 'next/server';

import { db } from '~/server/db';

export async function GET() {
    const devices = await db.device.findMany();

    return NextResponse.json(devices);
}
