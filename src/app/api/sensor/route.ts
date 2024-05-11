import { NextResponse } from 'next/server';

import { db } from '~/server/db';

export async function GET() {
    const sensors = await db.sensor.findMany();

    return NextResponse.json(sensors);
}
